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
        // Prefer a config kept above the web root; server/config.php still works as a fallback
        $candidates = array_filter([
            getenv('CLIPDESK_CONFIG') ?: null,
            dirname(__DIR__, 3) . '/clipdesk-config.php',
            __DIR__ . '/../config.php',
        ]);
        $path = null;
        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                $path = $candidate;
                break;
            }
        }
        if ($path === null) {
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

/**
 * The caller's IP. Behind a proxy or CDN, REMOTE_ADDR is the proxy, so set 'trusted_ip_header' in
 * config (e.g. 'HTTP_CF_CONNECTING_IP' or 'HTTP_X_FORWARDED_FOR') to the header your host controls.
 */
function client_ip(): string
{
    $header = config()['trusted_ip_header'] ?? '';
    if ($header !== '' && !empty($_SERVER[$header])) {
        $first = trim(explode(',', (string)$_SERVER[$header])[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) {
            return $first;
        }
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

/** Salted hash of a value (IP, email) so rate-limit and trial tables hold no raw personal data. */
function subject_hash(string $value): string
{
    $c = config();
    return hash('sha256', strtolower($value) . (($c['hash_salt'] ?? '') ?: $c['signing_secret_key']));
}

/** Allows at most $max hits per $windowSec for this subject (default: the caller's IP); else answers 429. */
function rate_limit(string $bucket, int $max, int $windowSec, ?string $subject = null): void
{
    $who = subject_hash($subject ?? client_ip());
    $pdo = db();
    $since = gmdate('Y-m-d H:i:s', time() - $windowSec);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND subject = ? AND created_at > ?');
    $stmt->execute([$bucket, $who, $since]);
    if ((int)$stmt->fetchColumn() >= $max) {
        header('Retry-After: ' . $windowSec);
        json_out(['error' => 'rate_limited', 'message' => 'Too many requests. Please try again later.'], 429);
    }
    $pdo->prepare('INSERT INTO rate_limits (bucket, subject, created_at) VALUES (?, ?, ?)')
        ->execute([$bucket, $who, gmdate('Y-m-d H:i:s')]);
    if (random_int(1, 50) === 1) {
        $pdo->prepare('DELETE FROM rate_limits WHERE created_at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 172800)]);
    }
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

/** Hides most of an email address for logs: a***@example.com */
function mask_email(string $email): string
{
    $at = strrpos($email, '@');
    return $at === false || $at < 1 ? '****' : $email[0] . '***' . substr($email, $at);
}

function h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}
