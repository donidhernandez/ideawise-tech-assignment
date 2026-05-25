<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\RateLimiter\RateLimiterFactory;

/**
 * Two rate-limit buckets:
 *   - "init": new upload sessions — 10 requests/minute (matches spec)
 *   - "chunk": chunk PUTs and the related status/finalize calls — 600/minute,
 *     enough for large files at 1 MiB chunks while still capping abuse.
 *
 * Both are keyed off X-User-Id (falling back to client IP). The bucket is
 * chosen by the request path so the strict /init quota cannot be amortized
 * by inflating chunk traffic, and vice versa.
 */
class RateLimitSubscriber implements EventSubscriberInterface
{
    private readonly RateLimiterFactory $initLimiter;
    private readonly RateLimiterFactory $chunkLimiter;

    public function __construct(
        RateLimiterFactory $apiUploadInitLimiter,
        RateLimiterFactory $apiUploadChunkLimiter,
    ) {
        $this->initLimiter = $apiUploadInitLimiter;
        $this->chunkLimiter = $apiUploadChunkLimiter;
    }

    public static function getSubscribedEvents(): array
    {
        // Run after UserIdSubscriber (priority 32), before controller resolution.
        return [
            KernelEvents::REQUEST => ['onRequest', 16],
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();
        if (!str_starts_with($request->getPathInfo(), '/api/')) {
            return;
        }
        if ($request->getMethod() === 'OPTIONS') {
            return;
        }

        $key = $request->headers->get('X-User-Id') ?? $request->getClientIp() ?? 'anonymous';
        $limiter = $this->pickBucket($request)->create($key);
        $consumed = $limiter->consume(1);

        if (!$consumed->isAccepted()) {
            $retryAfter = $consumed->getRetryAfter()->getTimestamp() - time();
            $response = new JsonResponse(
                ['error' => 'rate_limited', 'retryAfter' => max(1, $retryAfter)],
                429
            );
            $response->headers->set('Retry-After', (string) max(1, $retryAfter));
            $response->headers->set('X-RateLimit-Remaining', (string) $consumed->getRemainingTokens());
            $response->headers->set('X-RateLimit-Limit', (string) $consumed->getLimit());
            $event->setResponse($response);
        }
    }

    private function pickBucket(Request $request): RateLimiterFactory
    {
        // /api/uploads/init is the strict bucket; everything else under /api/ is the chunk bucket.
        return $request->getPathInfo() === '/api/uploads/init'
            ? $this->initLimiter
            : $this->chunkLimiter;
    }
}
