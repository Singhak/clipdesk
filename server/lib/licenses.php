<?php
declare(strict_types=1);

require_once __DIR__ . '/cashfree.php';

/** CLIP-XXXX-XXXX-XXXX from a Crockford-style alphabet (no I, L, O, U): 60 random bits. */
function generate_license_key(): string
{
    $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    $groups = [];
    for ($g = 0; $g < 3; $g++) {
        $chunk = '';
        for ($i = 0; $i < 4; $i++) {
            $chunk .= $alphabet[random_int(0, 31)];
        }
        $groups[] = $chunk;
    }
    return 'CLIP-' . implode('-', $groups);
}

function utc_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function find_license(string $key): ?array
{
    $stmt = db()->prepare('SELECT * FROM licenses WHERE license_key = ?');
    $stmt->execute([$key]);
    return $stmt->fetch() ?: null;
}

function license_is_active(array $license): bool
{
    if ((int)$license['revoked'] === 1) {
        return false;
    }
    return $license['expires_at'] === null || strtotime($license['expires_at'] . ' UTC') > time();
}

/**
 * Marks a Cashfree order paid and issues (or extends) its license. Safe to call repeatedly from the
 * webhook and the return page: the payment status is always re-checked with Cashfree, and a paid
 * order just returns its existing key.
 *
 * @return array{status: string, license_key?: string}
 */
function fulfill_order(string $orderId): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_id = ?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        return ['status' => 'unknown'];
    }
    if ($order['status'] === 'paid') {
        return ['status' => 'paid', 'license_key' => $order['license_key']];
    }

    $remote = cashfree_get_order($orderId);
    if (($remote['order_status'] ?? '') !== 'PAID') {
        return ['status' => strtolower((string)($remote['order_status'] ?? 'pending'))];
    }
    if (abs((float)$remote['order_amount'] - (float)$order['amount_inr']) > 0.009 || ($remote['order_currency'] ?? '') !== 'INR') {
        error_log("ClipDesk: amount mismatch on order $orderId");
        return ['status' => 'mismatch'];
    }

    $plan = config()['plans'][$order['plan']];
    $pdo->beginTransaction();
    try {
        // Re-read under lock so a concurrent webhook + return page can't issue two keys
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_id = ? FOR UPDATE');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if ($order['status'] === 'paid') {
            $pdo->commit();
            return ['status' => 'paid', 'license_key' => $order['license_key']];
        }

        $key = null;
        $renew = $order['renew_key'] ? find_license($order['renew_key']) : null;
        if ($renew && $order['plan'] === 'monthly' && $renew['plan'] === 'monthly' && (int)$renew['revoked'] === 0) {
            $from = max(time(), $renew['expires_at'] ? strtotime($renew['expires_at'] . ' UTC') : time());
            $pdo->prepare('UPDATE licenses SET expires_at = ? WHERE license_key = ?')
                ->execute([gmdate('Y-m-d H:i:s', $from + $plan['days'] * 86400), $renew['license_key']]);
            $key = $renew['license_key'];
        } else {
            $key = generate_license_key();
            $expires = $plan['days'] === null ? null : gmdate('Y-m-d H:i:s', time() + $plan['days'] * 86400);
            $pdo->prepare('INSERT INTO licenses (license_key, email, plan, expires_at, max_devices) VALUES (?, ?, ?, ?, ?)')
                ->execute([$key, $order['email'], $order['plan'], $expires, config()['max_devices']]);
        }

        $pdo->prepare("UPDATE orders SET status = 'paid', license_key = ?, paid_at = ? WHERE order_id = ?")
            ->execute([$key, utc_now(), $orderId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    send_license_email($order['email'], $key, $order['plan']);
    return ['status' => 'paid', 'license_key' => $key];
}

function send_license_email(string $email, string $key, string $plan): void
{
    $license = find_license($key);
    $expiry = $license && $license['expires_at'] ? 'Valid until: ' . $license['expires_at'] . " UTC\n" : "Valid: lifetime\n";
    $body = "Thanks for buying ClipDesk Pro!\n\n"
        . "Your license key: $key\n"
        . "Plan: $plan\n"
        . $expiry
        . "\nOpen ClipDesk > Upgrade > \"Have a License Key?\" and paste the key. "
        . "You can use it on up to " . config()['max_devices'] . " devices.\n";
    $headers = 'From: ' . config()['mail_from'] . "\r\nContent-Type: text/plain; charset=utf-8";
    if (!@mail($email, 'Your ClipDesk Pro license key', $body, $headers)) {
        error_log("ClipDesk: could not email license for $email");
    }
}
