<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Lightweight auth: every /api/ request must carry an X-User-Id header.
 * The actual auth layer is assumed to be external (out of MVP scope).
 */
class UserIdSubscriber implements EventSubscriberInterface
{
    public const ATTR_USER_ID = '_app_user_id';

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 32],
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

        $userId = $request->headers->get('X-User-Id');
        if (!is_string($userId) || trim($userId) === '') {
            $event->setResponse(new JsonResponse(
                ['error' => 'missing_user_id', 'message' => 'X-User-Id header is required'],
                401
            ));

            return;
        }

        $request->attributes->set(self::ATTR_USER_ID, trim($userId));
    }
}
