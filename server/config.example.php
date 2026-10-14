<?php
// Copy to config.php (gitignored) and fill in. Never commit real secrets.
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

    'plans' => [
        'monthly'  => ['amount_inr' => 499.00,  'days' => 30,   'label' => 'ClipDesk Pro - 30 days'],
        'lifetime' => ['amount_inr' => 2999.00, 'days' => null, 'label' => 'ClipDesk Pro - Lifetime'],
    ],
    // Long random string; enables logs.php (read logs from the browser or curl). Leave empty to disable.
    'admin_token' => '',

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
