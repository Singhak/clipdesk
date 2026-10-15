<?php
declare(strict_types=1);

require_once __DIR__ . '/phpmailer/Exception.php';
require_once __DIR__ . '/phpmailer/PHPMailer.php';
require_once __DIR__ . '/phpmailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

/** Splits "Name <addr@host>" (or a bare address) into [address, name]. */
function parse_mail_from(string $from): array
{
    if (preg_match('/^\s*(.*?)\s*<([^>]+)>\s*$/', $from, $m)) {
        return [$m[2], trim($m[1], " \"'")];
    }
    return [trim($from), ''];
}

/**
 * Sends one email through the SMTP mailbox in config()['smtp'] (falls back to PHP mail()
 * when no SMTP password is configured). Returns false and logs on failure; never throws.
 */
function send_mail(string $to, string $subject, string $html, string $text): bool
{
    $cfg = config();
    $smtp = $cfg['smtp'] ?? [];
    [$fromAddr, $fromName] = parse_mail_from((string)$cfg['mail_from']);

    $mail = new PHPMailer(true);
    try {
        $mail->CharSet = 'UTF-8';
        if (!empty($smtp['pass'])) {
            $mail->isSMTP();
            $mail->Host = (string)($smtp['host'] ?? 'smtp.hostinger.com');
            $mail->Port = (int)($smtp['port'] ?? 465);
            $mail->SMTPAuth = true;
            $mail->Username = (string)($smtp['user'] ?? $fromAddr);
            $mail->Password = (string)$smtp['pass'];
            $mail->SMTPSecure = ($smtp['secure'] ?? 'ssl') === 'tls'
                ? PHPMailer::ENCRYPTION_STARTTLS
                : PHPMailer::ENCRYPTION_SMTPS;
            $mail->Timeout = 15;
        } else {
            $mail->isMail();
        }
        $mail->setFrom($fromAddr, $fromName);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->isHTML(true);
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
        return true;
    } catch (Throwable $e) {
        log_event('error', 'mail failed', ['to' => mask_email($to), 'error' => $e->getMessage()]);
        return false;
    }
}

/** Builds the HTML + plain-text license email. $expiry is a UTC datetime string or null (lifetime). */
function license_email_content(string $key, string $plan, ?string $expiry, int $maxDevices): array
{
    $planLabel = config()['plans'][$plan]['label'] ?? $plan;
    $valid = $expiry ? 'Valid until ' . gmdate('j M Y', strtotime($expiry . ' UTC')) . ' (UTC)' : 'Lifetime';

    $text = "Thanks for buying ClipDesk Pro!\n\n"
        . "Your license key: $key\n"
        . "Plan: $planLabel\n"
        . "Validity: $valid\n\n"
        . "Open ClipDesk > Upgrade > \"Have a License Key?\" and paste the key. "
        . "You can use it on up to $maxDevices devices.\n";

    $k = h($key);
    $p = h($planLabel);
    $v = h($valid);
    $html = <<<HTML
<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1e293b;border-radius:12px;color:#e2e8f0;">
    <tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:700;color:#f59e0b;">ClipDesk Pro</td></tr>
    <tr><td style="padding:0 32px;font-size:15px;line-height:1.6;">
      <p style="margin:8px 0 16px;">Thanks for buying ClipDesk Pro! Here is your license key:</p>
      <div style="background:#020617;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:22px;letter-spacing:1px;color:#fbbf24;">$k</div>
      <p style="margin:16px 0 4px;color:#94a3b8;font-size:13px;">Plan: <span style="color:#e2e8f0;">$p</span><br>Validity: <span style="color:#e2e8f0;">$v</span></p>
      <p style="margin:20px 0 8px;">To activate: open ClipDesk, go to <b>Upgrade</b> &rarr; <b>Have a License Key?</b> and paste the key.</p>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:13px;">One key works on up to $maxDevices devices.</p>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;border-top:1px solid #334155;font-size:12px;color:#64748b;">Keep this email. Reply if you need help with your license.</td></tr>
  </table>
</td></tr>
</table>
</body></html>
HTML;

    return [$html, $text];
}
