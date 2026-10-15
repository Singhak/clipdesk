<?php
declare(strict_types=1);

function cashfree_base(): string
{
    return config()['cashfree']['env'] === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
}

function cashfree_request(string $method, string $path, ?array $body = null): array
{
    $c = config()['cashfree'];
    $ch = curl_init(cashfree_base() . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
            'x-client-id: ' . $c['app_id'],
            'x-client-secret: ' . $c['secret_key'],
            'x-api-version: ' . $c['api_version'],
        ],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);

    if ($raw === false) {
        throw new RuntimeException('Cashfree request failed: ' . $err);
    }
    $data = json_decode($raw, true) ?: [];
    if ($status >= 400) {
        throw new RuntimeException('Cashfree error ' . $status . ': ' . ($data['message'] ?? $raw));
    }
    return $data;
}

function cashfree_create_order(string $orderId, float $amount, string $email, string $phone, string $note): array
{
    $base = config()['api_base_url'];
    return cashfree_request('POST', '/orders', [
        'order_id'         => $orderId,
        'order_amount'     => $amount,
        'order_currency'   => 'INR',
        'order_note'       => $note,
        'customer_details' => [
            'customer_id'    => 'c_' . substr(hash('sha256', strtolower($email)), 0, 32),
            'customer_email' => $email,
            'customer_phone' => $phone,
        ],
        'order_meta' => [
            'return_url' => $base . '/order.php?order_id={order_id}',
            'notify_url' => $base . '/webhook.php',
        ],
    ]);
}

function cashfree_get_order(string $orderId): array
{
    return cashfree_request('GET', '/orders/' . rawurlencode($orderId));
}

/** Payment attempts on an order (a JSON list; empty if the customer never submitted one). */
function cashfree_get_order_payments(string $orderId): array
{
    return cashfree_request('GET', '/orders/' . rawurlencode($orderId) . '/payments');
}

/** Webhook signature: base64(HMAC-SHA256(timestamp . rawBody, secret_key)). */
function cashfree_verify_webhook(string $rawBody, string $timestamp, string $signature): bool
{
    if ($timestamp === '' || $signature === '') {
        return false;
    }
    $expected = base64_encode(hash_hmac('sha256', $timestamp . $rawBody, config()['cashfree']['secret_key'], true));
    return hash_equals($expected, $signature);
}
