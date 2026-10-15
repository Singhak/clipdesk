<?php
declare(strict_types=1);
// Read-only log viewer. Call with header 'X-Admin-Token: <admin_token>': logs.php[?date=YYYY-MM-DD][&lines=200][&level=error][&q=text]
// Add 'admin_token' (long random string) to config.php. Without it this endpoint is disabled.
require __DIR__ . '/lib/bootstrap.php';

$expected = (string)(config()['admin_token'] ?? '');
// Header only: a token in the query string would end up in access logs and referrers
$given = (string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
if (strlen($expected) < 24 || !hash_equals($expected, $given)) {
    http_response_code(404);
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$date = (string)($_GET['date'] ?? gmdate('Y-m-d'));
if ($date === 'list') {
    foreach (glob(log_dir() . '/*.log') ?: [] as $f) {
        echo basename($f), '  ', filesize($f), " bytes\n";
    }
    exit;
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    http_response_code(400);
    exit("bad date\n");
}
$file = log_dir() . "/$date.log";
if (!is_file($file)) {
    exit("no log for $date\n");
}

$limit = max(1, min(2000, (int)($_GET['lines'] ?? 200)));
$level = (string)($_GET['level'] ?? '');
$q = (string)($_GET['q'] ?? '');
$out = [];
foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
    if ($level !== '' && !str_contains($line, '"level":' . json_encode($level))) continue;
    if ($q !== '' && stripos($line, $q) === false) continue;
    $out[] = $line;
}
echo implode("\n", array_slice($out, -$limit)), "\n";
