<?php
// Copy to ../../clipdesk-config.php (one level above the web root, e.g. /home/user/clipdesk-config.php)
// or, if you can't, to server/config.php (gitignored). Never commit real secrets.
return [
    'db' => [
        'dsn'  => 'mysql:host=localhost;dbname=clipdesk;charset=utf8mb4',
        'user' => 'clipdesk',
        'pass' => 'change-me',
    ],

    'cashfree' => [
        'env'        => 'sandbox', // 'sandbox' or 'production'
        'app_id'     => 'TEST_APP_ID',
        'secret_key' => 'TEST_SECRET_KEY',
        'api_version' => '2023-08-01',
    ],

    // Output of: php bin/keygen.php  (base64, 64-byte secret key)
    'signing_secret_key' => '',

    // Public URL of this folder, used for Cashfree return_url and notify_url
    'api_base_url' => 'https://example.com/api',

    // Sender for license emails (must be a mailbox on your Hostinger domain)
    'mail_from' => 'ClipDesk <licenses@example.com>',

    // SMTP login for that mailbox (Hostinger: smtp.hostinger.com, 465 + ssl, or 587 + tls).
    // Leave 'pass' empty to fall back to PHP mail() (unreliable, often lands in spam).
    'smtp' => [
        'host'   => 'smtp.hostinger.com',
        'port'   => 465,
        'secure' => 'ssl', // 'ssl' or 'tls'
        'user'   => 'licenses@example.com',
        'pass'   => '',
    ],

    'plans' => [
        'monthly'  => ['amount_inr' => 499.00,  'days' => 30,   'label' => 'ClipDesk Pro - 30 days'],
        'lifetime' => ['amount_inr' => 2999.00, 'days' => null, 'label' => 'ClipDesk Pro - Lifetime'],
    ],
    // Long random string; enables logs.php (read logs from the browser or curl). Leave empty to disable.
    'admin_token' => '',

    // Header carrying the real client IP when the site sits behind a proxy/CDN, e.g. 'HTTP_CF_CONNECTING_IP'
    // or 'HTTP_X_FORWARDED_FOR'. Leave empty if clients connect directly. Without this behind a proxy,
    // every visitor shares one IP and the per-IP limits throttle everyone together.
    'trusted_ip_header' => '',

    // Salt for hashed IPs/emails in rate_limits and trials. Generate once: php -r "echo bin2hex(random_bytes(32));"
    'hash_salt' => '',

    'trial_days'  => 7,
    'max_devices' => 3,

    // Origins allowed to call the API. Electron file:// pages send "null".
    'cors_origins' => [
        'https://example.com',
        'http://localhost:5173',
        'chrome-extension://YOUR_EXTENSION_ID',
        'null',
    ],
];
