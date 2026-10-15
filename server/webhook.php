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
$orderId = (string)($event['data']['order']['order_id'] ?? $event['data']['refund']['order_id'] ?? $event['data']['dispute']['order_id'] ?? '');
$type = (string)($event['type'] ?? '');

// Log every verified webhook. A replay of an already-processed event is acknowledged without re-running it.
$eventKey = hash('sha256', $raw);
$pdo = db();
$pdo->prepare('INSERT IGNORE INTO webhook_events (event_key, type, order_id, payload) VALUES (?, ?, ?, ?)')
    ->execute([$eventKey, substr($type, 0, 64), $orderId !== '' ? $orderId : null, $raw]);
$stmt = $pdo->prepare('SELECT processed_at FROM webhook_events WHERE event_key = ?');
$stmt->execute([$eventKey]);
if ($stmt->fetchColumn()) {
    json_out(['ok' => true, 'duplicate' => true]);
}

// payments.order_id is a foreign key, so only record payments for orders we created
$payment = $event['data']['payment'] ?? null;
if ($orderId !== '' && is_array($payment) && !empty($payment['cf_payment_id'])) {
    $stmt = $pdo->prepare('SELECT 1 FROM orders WHERE order_id = ?');
    $stmt->execute([$orderId]);
    if ($stmt->fetch()) {
        record_payment($orderId, $payment);
    }
}

if ($type === 'PAYMENT_SUCCESS_WEBHOOK' && $orderId !== '') {
    try {
        fulfill_order($orderId); // re-verifies with the Cashfree API and is idempotent
    } catch (Throwable $e) {
        log_event('error', 'webhook: ' . $e->getMessage());
        $pdo->prepare('UPDATE webhook_events SET error = ? WHERE event_key = ?')->execute([substr($e->getMessage(), 0, 500), $eventKey]);
        json_out(['error' => 'retry'], 500); // Cashfree retries on non-2xx
    }
} elseif ($type === 'REFUND_STATUS_WEBHOOK' && $orderId !== '') {
    // Only a completed, full refund takes the license back; partial refunds are a manual decision
    $refund = $event['data']['refund'] ?? [];
    $stmt = $pdo->prepare('SELECT amount_inr FROM orders WHERE order_id = ?');
    $stmt->execute([$orderId]);
    $paid = $stmt->fetchColumn();
    if (strtoupper((string)($refund['refund_status'] ?? '')) === 'SUCCESS'
        && $paid !== false && (float)($refund['refund_amount'] ?? 0) + 0.009 >= (float)$paid) {
        reverse_order($orderId, 'refunded via Cashfree');
    } else {
        log_event('warn', 'refund webhook not applied', ['order' => $orderId, 'status' => $refund['refund_status'] ?? null]);
    }
} elseif (preg_match('/DISPUTE|CHARGEBACK/i', $type) && $orderId !== '') {
    // A dispute or chargeback suspends the license until you review it
    reverse_order($orderId, 'dispute: ' . substr($type, 0, 60));
} elseif (in_array($event['type'] ?? '', ['PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'], true) && $orderId !== '') {
    db()->prepare("UPDATE orders SET status = 'failed' WHERE order_id = ? AND status = 'created'")->execute([$orderId]);
}

$pdo->prepare('UPDATE webhook_events SET processed_at = ?, error = NULL WHERE event_key = ?')->execute([utc_now(), $eventKey]);
json_out(['ok' => true]);
