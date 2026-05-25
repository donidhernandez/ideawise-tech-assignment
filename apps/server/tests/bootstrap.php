<?php

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

if (method_exists(Dotenv::class, 'bootEnv')) {
    (new Dotenv())->bootEnv(dirname(__DIR__).'/.env');
}

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}

// Rebuild the SQLite test database schema before the suite runs.
$projectDir = dirname(__DIR__);
$testDb = $projectDir.'/var/data_test.db';
if (file_exists($testDb)) {
    unlink($testDb);
}

passthru(sprintf(
    '%s %s doctrine:schema:create --env=test --no-interaction 2>&1',
    escapeshellarg(PHP_BINARY),
    escapeshellarg($projectDir.'/bin/console')
));
