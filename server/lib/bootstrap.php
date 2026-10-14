<?php
declare(strict_types=1);

require __DIR__ . '/log.php';
log_register_handlers();

const CLIPDESK_KEY_PATTERN = '/^CLIP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/';
const CLIPDESK_DEVICE_PATTERN = '/^[A-Za-z0-9-]{8,64}$/';

function config(): array
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/../config.php';
        if (!is_file($path)) {
            http_response_code(500);
            exit('Server not configured: copy config.example.php to config.php');
        }
        $config = require $path;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        $pdo = new PDO($c['dsn'], $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

/** Sends CORS headers for allowed origins and answers preflight requests. */
function cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, config()['cors_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_input(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_out(['error' => 'POST required'], 405);
    }
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) {
        json_out(['error' => 'Invalid JSON body'], 400);
    }
    return $data;
}

function json_out(array $body, int $status = 200): never
{
    if ($status >= 400) {
        log_event($status >= 500 ? 'error' : 'warn', 'response ' . $status, ['body' => $body]);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function normalize_key(string $key): string
{
    return strtoupper(trim($key));
}

function h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}
