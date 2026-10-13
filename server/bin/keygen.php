<?php
// Usage: php bin/keygen.php
// Prints a fresh Ed25519 keypair. Put the secret in config.php and the public key in
// src/licensing/publicKey.ts (LICENSE_PUBLIC_KEY), then rebuild the apps.
// Rotating the key invalidates every token already issued; users just re-enter their key.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
$pair = sodium_crypto_sign_keypair();
echo "signing_secret_key (config.php):\n" . base64_encode(sodium_crypto_sign_secretkey($pair)) . "\n\n";
echo "LICENSE_PUBLIC_KEY (src/licensing/publicKey.ts):\n" . base64_encode(sodium_crypto_sign_publickey($pair)) . "\n";
