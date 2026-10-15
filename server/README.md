# ClipDesk licensing server (PHP + Cashfree)

This is a small PHP backend that sells Pro licenses through Cashfree and issues the signed tokens the apps check offline. It is written for Hostinger shared hosting but runs on any PHP host.

It needs:
- PHP 8.1+ with the `sodium`, `curl` and `pdo_mysql` extensions (all on by default on Hostinger)
- MySQL or MariaDB

## How it works

1. The app's "Buy" button opens `buy.php?plan=lifetime|monthly` in the browser. The buyer enters an email and phone number. A Cashfree order is created and the Cashfree checkout opens.
2. After paying, Cashfree does two things:
   - It calls `webhook.php`. The webhook signature is verified, and the order is re-checked through the Cashfree API.
   - It redirects the buyer to `order.php`.

   Whichever arrives first issues the key; the other one gets the same key back. The key is shown on screen and emailed.
3. The user pastes the key into the app, which calls `activate.php`. The server checks the device limit (3 by default) and returns an Ed25519-signed token bound to that device. The app verifies the token with the public key built into it, so Pro keeps working offline.
4. On startup the app calls `activate.php` again. That is how renewals, expiry and revocations reach the device. If the server can't be reached, the current token stays valid.

| Endpoint | Purpose |
| --- | --- |
| `buy.php` | Hosted checkout page |
| `order.php` | Cashfree return URL; shows the key |
| `webhook.php` | Cashfree payment webhook |
| `activate.php` | `POST {key, deviceId}` → `{token}` |
| `deactivate.php` | `POST {key, deviceId}` frees a device slot |
| `resend.php` | "Lost my key" page: emails a customer's active keys to their own address |
| `trial.php` | `POST {action: request\|verify\|resume, deviceId, email, code}` → emailed 6-digit code, then a 7-day trial token. One trial per email (aliases and disposable domains normalized or refused) and, in the desktop app, per machine (`hwid`, added by the main process) |

Plans:
- `monthly` is a one-time 30-day pass. Buying it again with the key in the "renewing" field adds 30 days to that key.
- `lifetime` never expires.
- Prices live in `config.php`. Keep `DISPLAY_PRICES` in `src/licensing/tierFeatures.ts` in sync with them.

## Setup on Hostinger

1. **Database.** In hPanel → Databases → MySQL, create a database and a user. Then either:
   - fresh database: import `schema.sql` in phpMyAdmin, or
   - after filling `config.php` (step 3): run `php bin/migrate.php`. It applies `migrations/*.sql` in order and records them in `schema_migrations`. Use this for any database that already has data, and after every update that adds a migration.

   Don't mix the two: `schema.sql` is just the migrations concatenated, so importing it into a migrated database fails on the `ALTER`s.

   Tables: `licenses`, `activations`, `trials`, `trial_pending` (licensing; migration 004); `orders`, `payments` (one row per Cashfree attempt), `webhook_events` (raw webhook log, replay-safe); `license_events` (issued / renewed / revoked / activated / deactivated audit trail).
   To change the schema, add a new `migrations/NNN_name.sql`, then regenerate `schema.sql`: `cat migrations/*.sql` with the two header lines.
2. **Upload.** Upload this folder's contents to `public_html/api/`. The `.htaccess` files block `lib/`, `bin/`, `config.php` and `schema.sql`.
3. **Config.** Copy `config.example.php` to `clipdesk-config.php` in your home folder, one level above `public_html` (or set the `CLIPDESK_CONFIG` env var to its path). If your host won't allow that, use `server/config.php` instead. Fill in:
   - `trusted_ip_header` if the site is behind a proxy/CDN, and a random `hash_salt` (see the comments in the example). Run `php bin/migrate.php` after updating: migration 003 adds the rate-limit table.
   - the database credentials
   - the Cashfree App ID and Secret Key (Cashfree dashboard → Developers → API Keys; start with Test/sandbox)
   - `api_base_url`, for example `https://yourdomain.com/api`
   - `mail_from`, a mailbox on your domain, and `smtp.pass`, that mailbox's password. Emails go out through PHPMailer (bundled in `lib/phpmailer/`) over Hostinger SMTP; with an empty `smtp.pass` it falls back to PHP `mail()`
   - `cors_origins`: your site, `http://localhost:5173` for dev, `chrome-extension://<your extension id>`, and `null` for the desktop app
4. **Signing key.** Generate it once with `php bin/keygen.php`, from hPanel's SSH or any machine with PHP 8.1+.
   - Put `signing_secret_key` in `config.php`. Keep it secret: anyone with it can mint Pro tokens.
   - Build the apps with the public key and API URL. They are safe to publish:
     ```
     VITE_LICENSE_PUBLIC_KEY=<public key>
     VITE_LICENSE_API=https://yourdomain.com/api
     ```
     Put these in `.env.local` (gitignored) or in CI secrets, then run `npm run package:all`.
5. **Webhook.** In Cashfree → Developers → Webhooks, add `https://yourdomain.com/api/webhook.php` for Payment events (version 2023-08-01).
6. **Go live.** Switch `cashfree.env` to `production` and use the production keys. Cashfree only approves production after your site has Terms, Privacy Policy, Refund Policy and Contact pages.

## Test checklist (sandbox)

- Open `buy.php`, pay with a Cashfree test card or UPI, and confirm `order.php` shows a `CLIP-…` key and the email arrives.
- Activate the key in the web app, desktop app and extension. A 4th device should get "already active on 3 devices".
- Resend the webhook from the Cashfree dashboard. No second key should be created.
- Revoke a key with `UPDATE licenses SET revoked = 1 WHERE license_key = '…'`. The app should drop to Free on its next start.

## Support tasks (SQL)

```sql
-- Find a customer's keys
SELECT * FROM licenses WHERE email = 'buyer@example.com';
-- Free all device slots for a key
DELETE FROM activations WHERE license_key = 'CLIP-XXXX-XXXX-XXXX';
-- Refund: revoke the key and mark its order refunded
UPDATE licenses SET revoked = 1, revoked_at = UTC_TIMESTAMP(), revoked_reason = 'refund' WHERE license_key = 'CLIP-XXXX-XXXX-XXXX';
UPDATE orders SET status = 'refunded', refunded_at = UTC_TIMESTAMP() WHERE license_key = 'CLIP-XXXX-XXXX-XXXX';
-- Payment attempts and history for a key
SELECT o.order_id, o.status, p.method, p.status AS pay_status, p.failure_reason FROM orders o LEFT JOIN payments p USING (order_id) WHERE o.license_key = 'CLIP-XXXX-XXXX-XXXX';
SELECT * FROM license_events WHERE license_key = 'CLIP-XXXX-XXXX-XXXX' ORDER BY created_at;
-- Webhooks that failed processing
SELECT received_at, type, order_id, error FROM webhook_events WHERE processed_at IS NULL;
```

## Open source note

ClipDesk is GPL-3.0. Anyone may build it without these checks, and that is allowed. The license system only makes sure official builds can't be unlocked by editing local storage or by guessing keys.
