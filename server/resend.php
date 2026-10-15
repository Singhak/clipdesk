<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/licenses.php';

// "Lost my key": emails every active license on an address to that address. The answer is the same
// whether or not the address has licenses, so the page can't be used to find out who is a customer.

$sent = false;
$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim((string)($_POST['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Enter the email address you used at checkout.';
    } else {
        rate_limit('resend_ip', 5, 3600);
        rate_limit('resend_email', 3, 86400, $email);
        $stmt = db()->prepare('SELECT license_key FROM licenses WHERE email = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 5');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $key) {
            $license = find_license($key);
            if ($license && license_is_active($license)) {
                send_license_email($email, $key, $license['plan']);
            }
        }
        log_event('info', 'resend requested', ['email' => mask_email($email)]);
        $sent = true;
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recover your ClipDesk key</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b0d14; color: #e2e8f0; }
  main { max-width: 420px; margin: 64px auto; padding: 0 16px; }
  .muted { color: #94a3b8; font-size: 13px; }
  input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #020617; color: inherit; }
  button { margin-top: 14px; width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #f59e0b; color: #000; font-weight: 700; cursor: pointer; }
  .err { margin-top: 14px; padding: 10px; border-radius: 8px; background: #7f1d1d55; color: #fecaca; font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>Recover your key</h1>
<?php if ($sent): ?>
  <p>If that address has an active ClipDesk license, the key is on its way. Check spam too.</p>
<?php else: ?>
  <p class="muted">Enter the email you used at checkout and we will send your license key(s) there again.</p>
  <form method="post">
    <input name="email" type="email" required autocomplete="email" value="<?= h((string)($_POST['email'] ?? '')) ?>">
    <button type="submit">Email my key</button>
    <?php if ($error): ?><div class="err"><?= h($error) ?></div><?php endif; ?>
  </form>
<?php endif; ?>
</main>
</body>
</html>
