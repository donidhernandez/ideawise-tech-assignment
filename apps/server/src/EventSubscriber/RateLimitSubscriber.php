<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\RateLimiter\RateLimiterFactory;

class RateLimitSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly RateLimiterFactory $apiUploadLimiter)
    {
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
        $limiter = $this->apiUploadLimiter->create($key);
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
}
