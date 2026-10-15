<?php
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/token.php';
require __DIR__ . '/lib/mailer.php';

// One email-verified trial per email address, per device, and (desktop app) per machine.
//   action=resume  {deviceId}                   re-issues the token of a trial already started on this device
//   action=request {deviceId, email, hwid?}     emails a 6-digit code
//   action=verify  {deviceId, email, code, hwid?} checks the code and starts the trial
cors();
rate_limit('trial', 30, 600);
$in = json_input();
$action = (string)($in['action'] ?? 'resume');
$deviceId = (string)($in['deviceId'] ?? '');
if (!preg_match(CLIPDESK_DEVICE_PATTERN, $deviceId)) {
    json_out(['error' => 'invalid'], 400);
}
$hwid = (string)($in['hwid'] ?? '');
$hwHash = preg_match('/^[a-f0-9]{64}$/', $hwid) ? subject_hash('hw:' . $hwid) : null;

/** True if the domain (or a parent of it) is on the bundled disposable-email list (lib/disposable_domains.txt). */
function is_disposable_domain(string $domain): bool
{
    static $set = null;
    $set ??= array_flip(array_filter(array_map('trim', file(__DIR__ . '/lib/disposable_domains.txt') ?: [])));
    $parts = explode('.', $domain);
    for ($i = 0; $i < count($parts) - 1; $i++) {
        if (isset($set[implode('.', array_slice($parts, $i))])) {
            return true;
        }
    }
    return false;
}

/** Lowercases and strips +tags (and Gmail dots) so aliases of one mailbox count once. Null if unusable. */
function normalize_trial_email(string $email): ?string
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
        return null;
    }
    [$local, $domain] = explode('@', $email, 2);
    if (is_disposable_domain($domain)) {
        return null;
    }
    $local = explode('+', $local, 2)[0];
    if ($domain === 'googlemail.com') {
        $domain = 'gmail.com';
    }
    if ($domain === 'gmail.com') {
        $local = str_replace('.', '', $local);
    }
    return $local === '' ? null : $local . '@' . $domain;
}

function trial_token(string $deviceId, int $startedAt): void
{
    $exp = $startedAt + (int)config()['trial_days'] * 86400;
    if ($exp <= time()) {
        json_out(['error' => 'trial_used', 'message' => 'Your free trial has ended. Upgrade to keep Pro.'], 403);
    }
    json_out(['token' => sign_token([
        'v' => 1, 'tier' => 'pro', 'plan' => 'trial', 'key' => null,
        'deviceId' => $deviceId, 'iat' => time(), 'exp' => $exp,
    ])]);
}

$pdo = db();
$stmt = $pdo->prepare('SELECT created_at FROM trials WHERE device_id = ?');
$stmt->execute([$deviceId]);
$existing = $stmt->fetchColumn();

if ($action === 'resume') {
    if ($existing === false) {
        json_out(['error' => 'no_trial', 'message' => 'No trial has been started on this device.'], 404);
    }
    trial_token($deviceId, strtotime($existing . ' UTC'));
}
if ($existing !== false) {
    json_out(['error' => 'trial_used', 'message' => 'A free trial was already started on this device.'], 403);
}

$email = normalize_trial_email((string)($in['email'] ?? ''));
if ($email === null) {
    json_out(['error' => 'invalid_email', 'message' => 'Enter a real email address. Temporary or disposable email addresses are not accepted.'], 400);
}
$emailHash = subject_hash($email);

if ($action === 'request') {
    $stmt = $pdo->prepare('SELECT 1 FROM trials WHERE email_hash = ?' . ($hwHash ? ' OR hw_hash = ?' : ''));
    $stmt->execute($hwHash ? [$emailHash, $hwHash] : [$emailHash]);
    if ($stmt->fetchColumn()) {
        json_out(['error' => 'trial_used', 'message' => 'A free trial was already used with this email or on this computer.'], 403);
    }
    $ipHash = subject_hash(client_ip());
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM trials WHERE ip_hash = ? AND created_at > ?');
    $stmt->execute([$ipHash, gmdate('Y-m-d H:i:s', time() - 86400)]);
    if ((int)$stmt->fetchColumn() >= 3) {
        json_out(['error' => 'rate_limited', 'message' => 'Too many trials from this network today.'], 429);
    }
    rate_limit('trial_code_ip', 10, 3600);
    rate_limit('trial_code_email', 3, 3600, $email);

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $pdo->prepare('REPLACE INTO trial_pending (email_hash, device_id, hw_hash, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
        ->execute([$emailHash, $deviceId, $hwHash, subject_hash($code . $email), gmdate('Y-m-d H:i:s', time() + 900), gmdate('Y-m-d H:i:s')]);
    $days = (int)config()['trial_days'];
    send_mail(
        trim((string)$in['email']),
        "Your ClipDesk trial code: $code",
        "<p>Your ClipDesk verification code is</p><p style=\"font-size:28px;font-weight:bold;letter-spacing:4px\">$code</p>"
        . "<p>It expires in 15 minutes. Enter it in the app to start your $days-day Pro trial.</p><p>If you did not ask for this, ignore this email.</p>",
        "Your ClipDesk verification code is $code. It expires in 15 minutes."
    );
    json_out(['sent' => true, 'message' => 'We emailed a 6-digit code. It is valid for 15 minutes.']);
}

if ($action === 'verify') {
    rate_limit('trial_verify', 30, 600);
    $stmt = $pdo->prepare('SELECT device_id, code_hash, attempts, expires_at FROM trial_pending WHERE email_hash = ?');
    $stmt->execute([$emailHash]);
    $row = $stmt->fetch();
    $bad = ['error' => 'bad_code', 'message' => 'That code is wrong or has expired. Request a new one.'];
    if (!$row || $row['device_id'] !== $deviceId || strtotime($row['expires_at'] . ' UTC') < time() || (int)$row['attempts'] >= 5) {
        json_out($bad, 400);
    }
    $code = preg_replace('/\D/', '', (string)($in['code'] ?? ''));
    if (!hash_equals($row['code_hash'], subject_hash($code . $email))) {
        $pdo->prepare('UPDATE trial_pending SET attempts = attempts + 1 WHERE email_hash = ?')->execute([$emailHash]);
        json_out($bad, 400);
    }
    if ($hwHash) {
        $stmt = $pdo->prepare('SELECT 1 FROM trials WHERE hw_hash = ?');
        $stmt->execute([$hwHash]);
        if ($stmt->fetchColumn()) {
            json_out(['error' => 'trial_used', 'message' => 'A free trial was already used on this computer.'], 403);
        }
    }
    $startedAt = time();
    try {
        $pdo->prepare('INSERT INTO trials (device_id, ip_hash, email_hash, hw_hash, created_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$deviceId, subject_hash(client_ip()), $emailHash, $hwHash, gmdate('Y-m-d H:i:s', $startedAt)]);
    } catch (PDOException $e) {
        json_out(['error' => 'trial_used', 'message' => 'A free trial was already used with this email.'], 403);
    }
    $pdo->prepare('DELETE FROM trial_pending WHERE email_hash = ?')->execute([$emailHash]);
    trial_token($deviceId, $startedAt);
}

json_out(['error' => 'invalid'], 400);
