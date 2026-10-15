<?php
declare(strict_types=1);

function b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

/**
 * Signs a license payload. Token format: base64url(json) "." base64url(ed25519 signature over the first part).
 * The client verifies it offline with the public key printed by bin/keygen.php.
 */
function sign_token(array $payload): string
{
    $secret = base64_decode(config()['signing_secret_key'], true);
    if ($secret === false || strlen($secret) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
        throw new RuntimeException('signing_secret_key is missing or invalid; run bin/keygen.php');
    }
    $body = b64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    return $body . '.' . b64url_encode(sodium_crypto_sign_detached($body, $secret));
}

/** Lifetime keys never expire, but their tokens do, so a revoke reaches a device within this window. */
const LIFETIME_TOKEN_DAYS = 45;

function license_token(array $license, string $deviceId): string
{
    return sign_token([
        'v'        => 1,
        'tier'     => 'pro',
        'plan'     => $license['plan'],
        'key'      => $license['license_key'],
        'deviceId' => $deviceId,
        'iat'      => time(),
        'exp'      => $license['expires_at'] === null
            ? time() + LIFETIME_TOKEN_DAYS * 86400
            : strtotime($license['expires_at'] . ' UTC'),
    ]);
}
