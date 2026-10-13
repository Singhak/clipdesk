<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';

// Frees this device's slot so the key can be activated elsewhere.
cors();
$in = json_input();
$key = normalize_key((string)($in['key'] ?? ''));
$deviceId = (string)($in['deviceId'] ?? '');

if (!preg_match(CLIPDESK_KEY_PATTERN, $key) || !preg_match(CLIPDESK_DEVICE_PATTERN, $deviceId)) {
    json_out(['error' => 'invalid'], 400);
}

db()->prepare('DELETE FROM activations WHERE license_key = ? AND device_id = ?')->execute([$key, $deviceId]);
json_out(['ok' => true]);
