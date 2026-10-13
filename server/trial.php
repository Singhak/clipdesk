<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/token.php';

// One 7-day trial per device, and at most 3 trials per IP per day.
cors();
$in = json_input();
$deviceId = (string)($in['deviceId'] ?? '');
if (!preg_match(CLIPDESK_DEVICE_PATTERN, $deviceId)) {
    json_out(['error' => 'invalid'], 400);
}

$pdo = db();
$days = (int)config()['trial_days'];
$stmt = $pdo->prepare('SELECT created_at FROM trials WHERE device_id = ?');
$stmt->execute([$deviceId]);
$existing = $stmt->fetchColumn();

if ($existing === false) {
    $ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . config()['signing_secret_key']);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM trials WHERE ip_hash = ? AND created_at > ?');
    $stmt->execute([$ipHash, gmdate('Y-m-d H:i:s', time() - 86400)]);
    if ((int)$stmt->fetchColumn() >= 3) {
        json_out(['error' => 'rate_limited', 'message' => 'Too many trials from this network today.'], 429);
    }
    $startedAt = time();
    $pdo->prepare('INSERT INTO trials (device_id, ip_hash, created_at) VALUES (?, ?, ?)')
        ->execute([$deviceId, $ipHash, gmdate('Y-m-d H:i:s', $startedAt)]);
} else {
    $startedAt = strtotime($existing . ' UTC');
}

$exp = $startedAt + $days * 86400;
if ($exp <= time()) {
    json_out(['error' => 'trial_used', 'message' => 'The free trial on this device has ended. Upgrade to keep Pro.'], 403);
}

json_out(['token' => sign_token([
    'v'        => 1,
    'tier'     => 'pro',
    'plan'     => 'trial',
    'key'      => null,
    'deviceId' => $deviceId,
    'iat'      => time(),
    'exp'      => $exp,
])]);
