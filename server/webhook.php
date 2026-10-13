<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';

$raw = file_get_contents('php://input') ?: '';
$ok = cashfree_verify_webhook(
    $raw,
    (string)($_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? ''),
    (string)($_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '')
);
if (!$ok) {
    json_out(['error' => 'bad signature'], 401);
}

$event = json_decode($raw, true) ?: [];
$orderId = (string)($event['data']['order']['order_id'] ?? '');

if (($event['type'] ?? '') === 'PAYMENT_SUCCESS_WEBHOOK' && $orderId !== '') {
    try {
        fulfill_order($orderId); // re-verifies with the Cashfree API and is idempotent
    } catch (Throwable $e) {
        error_log('ClipDesk webhook: ' . $e->getMessage());
        json_out(['error' => 'retry'], 500); // Cashfree retries on non-2xx
    }
} elseif (in_array($event['type'] ?? '', ['PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'], true) && $orderId !== '') {
    db()->prepare("UPDATE orders SET status = 'failed' WHERE order_id = ? AND status = 'created'")->execute([$orderId]);
}

json_out(['ok' => true]);
