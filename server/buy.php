<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';

// Hosted checkout page. The apps open this in the system browser, so the Cashfree SDK never has to
// load inside the Chrome extension or Electron (both block remote scripts).

$plans = config()['plans'];
$error = null;
$plan = $_REQUEST['plan'] ?? 'lifetime';
if (!isset($plans[$plan])) {
    $plan = 'lifetime';
}
$email = trim((string)($_POST['email'] ?? ''));
$phone = preg_replace('/\D/', '', (string)($_POST['phone'] ?? ''));
$renewKey = normalize_key((string)($_REQUEST['renew'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Enter a valid email address. Your license key is sent there.';
    } elseif (!preg_match('/^[6-9]\d{9}$/', substr($phone, -10))) {
        $error = 'Enter a valid 10-digit mobile number (Cashfree requires one).';
    } elseif ($renewKey !== '' && ($plan !== 'monthly' || !preg_match(CLIPDESK_KEY_PATTERN, $renewKey) || !find_license($renewKey))) {
        $error = 'That license key cannot be renewed. Leave it empty to buy a new key.';
    } else {
        $orderId = 'cd_' . bin2hex(random_bytes(10));
        $amount = (float)$plans[$plan]['amount_inr'];
        db()->prepare('INSERT INTO orders (order_id, email, plan, amount_inr, renew_key) VALUES (?, ?, ?, ?, ?)')
            ->execute([$orderId, $email, $plan, $amount, $renewKey !== '' ? $renewKey : null]);
        try {
            $cf = cashfree_create_order($orderId, $amount, $email, substr($phone, -10), $plans[$plan]['label']);
            $sessionId = $cf['payment_session_id'];
        } catch (Throwable $e) {
            error_log('ClipDesk checkout: ' . $e->getMessage());
            $error = 'Could not start the payment. Please try again in a minute.';
        }
    }
}
$mode = config()['cashfree']['env'] === 'production' ? 'production' : 'sandbox';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buy ClipDesk Pro</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b0d14; color: #e2e8f0; }
  main { max-width: 420px; margin: 48px auto; padding: 0 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #94a3b8; font-size: 13px; }
  .plans { display: grid; gap: 10px; margin: 20px 0; }
  .plan { display: flex; gap: 10px; align-items: center; padding: 12px; border: 1px solid #1e293b; border-radius: 10px; cursor: pointer; }
  .plan:has(input:checked) { border-color: #f59e0b; background: #f59e0b10; }
  label.f { display: block; margin: 12px 0 4px; font-size: 13px; }
  input[type=email], input[type=tel], input[type=text] { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #020617; color: inherit; }
  button { margin-top: 18px; width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #f59e0b; color: #000; font-weight: 700; cursor: pointer; }
  .err { margin-top: 14px; padding: 10px; border-radius: 8px; background: #7f1d1d55; color: #fecaca; font-size: 13px; }
</style>
</head>
<body>
<main>
<?php if (isset($sessionId)): ?>
  <h1>Opening secure checkout…</h1>
  <p class="muted">If nothing happens, reload this page.</p>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
  <script>
    Cashfree({ mode: <?= json_encode($mode) ?> }).checkout({
      paymentSessionId: <?= json_encode($sessionId) ?>,
      redirectTarget: '_self'
    });
  </script>
<?php else: ?>
  <h1>ClipDesk Pro</h1>
  <p class="muted">No watermark, unlimited recording length, 16 Mbps export, Pro templates. Works on Web, Desktop and the Chrome extension, up to <?= (int)config()['max_devices'] ?> devices.</p>
  <form method="post">
    <div class="plans">
      <?php foreach ($plans as $id => $p): ?>
        <label class="plan">
          <input type="radio" name="plan" value="<?= h($id) ?>" <?= $id === $plan ? 'checked' : '' ?>>
          <span><strong>₹<?= number_format((float)$p['amount_inr']) ?></strong> · <?= h($p['label']) ?></span>
        </label>
      <?php endforeach; ?>
    </div>
    <label class="f" for="email">Email (your key is sent here)</label>
    <input id="email" name="email" type="email" required value="<?= h($email) ?>">
    <label class="f" for="phone">Mobile number</label>
    <input id="phone" name="phone" type="tel" required inputmode="numeric" value="<?= h($phone) ?>">
    <label class="f" for="renew">Renewing a 30-day pass? Existing key (optional)</label>
    <input id="renew" name="renew" type="text" placeholder="CLIP-XXXX-XXXX-XXXX" value="<?= h($renewKey) ?>">
    <button type="submit">Continue to payment</button>
    <?php if ($error): ?><div class="err"><?= h($error) ?></div><?php endif; ?>
  </form>
  <p class="muted">Payments are processed by Cashfree. Prices include applicable taxes.</p>
<?php endif; ?>
</main>
</body>
</html>
