<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';
require __DIR__ . '/lib/token.php';

// Activates a key on a device (or refreshes an existing activation) and returns a signed token.
cors();
$in = json_input();
$key = normalize_key((string)($in['key'] ?? ''));
$deviceId = (string)($in['deviceId'] ?? '');

if (!preg_match(CLIPDESK_KEY_PATTERN, $key) || !preg_match(CLIPDESK_DEVICE_PATTERN, $deviceId)) {
    json_out(['error' => 'invalid', 'message' => 'That is not a valid ClipDesk license key.'], 400);
}

$license = find_license($key);
if (!$license) {
    json_out(['error' => 'not_found', 'message' => 'License key not found. Check for typos.'], 404);
}
if ((int)$license['revoked'] === 1) {
    json_out(['error' => 'revoked', 'message' => 'This license key has been revoked.'], 403);
}
if (!license_is_active($license)) {
    json_out(['error' => 'expired', 'message' => 'This 30-day pass has expired. Renew it to keep Pro.'], 403);
}

$pdo = db();
$stmt = $pdo->prepare('SELECT 1 FROM activations WHERE license_key = ? AND device_id = ?');
$stmt->execute([$key, $deviceId]);
if ($stmt->fetch()) {
    $pdo->prepare('UPDATE activations SET last_seen = ? WHERE license_key = ? AND device_id = ?')
        ->execute([utc_now(), $key, $deviceId]);
} else {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM activations WHERE license_key = ?');
    $stmt->execute([$key]);
    if ((int)$stmt->fetchColumn() >= (int)$license['max_devices']) {
        json_out([
            'error' => 'device_limit',
            'message' => 'This key is already active on ' . (int)$license['max_devices'] . ' devices. Deactivate one of them first.',
        ], 409);
    }
    $pdo->prepare('INSERT INTO activations (license_key, device_id, last_seen) VALUES (?, ?, ?)')
        ->execute([$key, $deviceId, utc_now()]);
}

json_out(['token' => license_token($license, $deviceId)]);
