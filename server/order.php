<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';

// Cashfree return_url. Fulfils the order here too in case the webhook is late.

$orderId = (string)($_GET['order_id'] ?? '');
$result = ['status' => 'unknown'];
if (preg_match('/^cd_[0-9a-f]{20}$/', $orderId)) {
    try {
        $result = fulfill_order($orderId);
    } catch (Throwable $e) {
        error_log('ClipDesk order: ' . $e->getMessage());
        $result = ['status' => 'error'];
    }
}
$paid = $result['status'] === 'paid';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $paid ? 'Your ClipDesk key' : 'Payment status' ?></title>
<?php if (!$paid && in_array($result['status'], ['active', 'pending'], true)): ?>
<meta http-equiv="refresh" content="5">
<?php endif; ?>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b0d14; color: #e2e8f0; }
  main { max-width: 460px; margin: 64px auto; padding: 0 16px; text-align: center; }
  code { display: block; margin: 18px 0; padding: 14px; border-radius: 10px; background: #020617; border: 1px solid #f59e0b; font-size: 20px; letter-spacing: 1px; user-select: all; }
  .muted { color: #94a3b8; font-size: 13px; }
</style>
</head>
<body>
<main>
<?php if ($paid): ?>
  <h1>Payment received 🎉</h1>
  <p>Your ClipDesk Pro license key:</p>
  <code><?= h($result['license_key']) ?></code>
  <p class="muted">We also emailed it to you. In ClipDesk, open Upgrade → "Have a License Key?" and paste it.</p>
<?php elseif (in_array($result['status'], ['active', 'pending'], true)): ?>
  <h1>Waiting for payment confirmation…</h1>
  <p class="muted">This page refreshes automatically. Don't close it.</p>
<?php else: ?>
  <h1>Payment not completed</h1>
  <p class="muted">No money was taken, or the payment failed. You can <a href="buy.php" style="color:#f59e0b">try again</a>. If you were charged, email us with order ID <?= h($orderId) ?>.</p>
<?php endif; ?>
</main>
</body>
</html>
