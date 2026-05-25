<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\Event\TerminateEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Logs one INFO line per /api request to the "uploads" Monolog channel.
 *
 *   { method, path, status, ip, ua, userId, durationMs }
 *
 * Hooked into TERMINATE so it runs after the response is fully sent and
 * we have the final status code. The request timestamp is captured at
 * RESPONSE time (which is also after controller execution) so the duration
 * reflects controller + serialization work.
 */
class AuditLogSubscriber implements EventSubscriberInterface
{
    private const ATTR_STARTED_AT = '_app_audit_started_at';
    private const ATTR_STATUS = '_app_audit_status';

    public function __construct(
        #[Autowire(service: 'monolog.logger.uploads')]
        private readonly LoggerInterface $logger,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::RESPONSE => 'onResponse',
            KernelEvents::TERMINATE => 'onTerminate',
        ];
    }

    public function onResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $req = $event->getRequest();
        if (!$this->isAuditable($req)) {
            return;
        }
        // Stash status + start time so TERMINATE can read them; the request
        // attributes survive the response→terminate transition.
        $req->attributes->set(self::ATTR_STATUS, $event->getResponse()->getStatusCode());
        if (!$req->attributes->has(self::ATTR_STARTED_AT)) {
            $req->attributes->set(self::ATTR_STARTED_AT, microtime(true));
        }
    }

    public function onTerminate(TerminateEvent $event): void
    {
        $req = $event->getRequest();
        if (!$this->isAuditable($req)) {
            return;
        }
        $startedAt = $req->attributes->get(self::ATTR_STARTED_AT);
        $durationMs = is_float($startedAt) ? (int) round((microtime(true) - $startedAt) * 1000) : null;

        $this->logger->info('api.request', [
            'method' => $req->getMethod(),
            'path' => $req->getPathInfo(),
            'status' => $req->attributes->get(self::ATTR_STATUS) ?? $event->getResponse()->getStatusCode(),
            'ip' => $req->getClientIp(),
            'ua' => $req->headers->get('User-Agent', ''),
            'userId' => $req->attributes->get(UserIdSubscriber::ATTR_USER_ID),
            'durationMs' => $durationMs,
        ]);
    }

    private function isAuditable(Request $request): bool
    {
        if (!str_starts_with($request->getPathInfo(), '/api/')) {
            return false;
        }
        if ($request->getMethod() === 'OPTIONS') {
            return false;
        }
        return true;
    }
}
