<?php
declare(strict_types=1);

/** Directory for log files. Created on first write and blocked from the web by its own .htaccess. */
function log_dir(): string
{
    $dir = __DIR__ . '/../logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
        @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    }
    return $dir;
}

/** Hides most of a license key or device id so logs never hold a usable secret. */
function log_mask(string $value): string
{
    return strlen($value) <= 8 ? '****' : substr($value, 0, 5) . '…' . substr($value, -3);
}

/** Appends one JSON line to logs/YYYY-MM-DD.log. Never throws. */
function log_event(string $level, string $message, array $context = []): void
{
    try {
        $line = json_encode([
            'ts' => gmdate('c'),
            'level' => $level,
            'msg' => $message,
            'script' => basename($_SERVER['SCRIPT_NAME'] ?? 'cli'),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            'ctx' => $context ?: null,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        @file_put_contents(log_dir() . '/' . gmdate('Y-m-d') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
    } catch (Throwable) {
        // logging must never break a request
    }
}

/** Logs uncaught exceptions, fatal errors and every 5xx response. Call once from bootstrap. */
function log_register_handlers(): void
{
    set_exception_handler(function (Throwable $e): void {
        log_event('error', 'uncaught ' . get_class($e) . ': ' . $e->getMessage(), [
            'file' => basename($e->getFile()), 'line' => $e->getLine(),
        ]);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo '{"error":"server error"}';
    });
    register_shutdown_function(function (): void {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            log_event('fatal', $err['message'], ['file' => basename($err['file']), 'line' => $err['line']]);
        }
    });
}
