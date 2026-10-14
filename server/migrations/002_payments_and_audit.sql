-- Payment records, webhook log, license audit trail, and order/license integrity.

ALTER TABLE orders
  ADD COLUMN phone VARCHAR(15) NULL AFTER email,
  ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'INR' AFTER amount_inr,
  ADD COLUMN refunded_at DATETIME NULL,
  MODIFY COLUMN status ENUM('created','paid','failed','refunded') NOT NULL DEFAULT 'created',
  ADD KEY idx_orders_email (email),
  ADD KEY idx_orders_license (license_key),
  ADD KEY idx_orders_status (status, created_at);

-- One row per Cashfree payment attempt on an order
CREATE TABLE IF NOT EXISTS payments (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id       VARCHAR(48)  NOT NULL,
  cf_payment_id  VARCHAR(64)  NOT NULL,
  status         ENUM('success','failed','pending','user_dropped','refunded') NOT NULL,
  method         VARCHAR(32)  NULL,          -- upi, card, netbanking, wallet ...
  amount         DECIMAL(10,2) NOT NULL,
  currency       CHAR(3)      NOT NULL DEFAULT 'INR',
  bank_reference VARCHAR(64)  NULL,
  failure_reason VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cf_payment (cf_payment_id),
  KEY idx_payments_order (order_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Raw Cashfree webhooks. event_key (sha256 of the body) makes retries and replays no-ops.
CREATE TABLE IF NOT EXISTS webhook_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_key     CHAR(64)     NOT NULL,
  type          VARCHAR(64)  NOT NULL,
  order_id      VARCHAR(48)  NULL,
  payload       MEDIUMTEXT   NOT NULL,
  received_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at  DATETIME     NULL,
  error         VARCHAR(500) NULL,
  UNIQUE KEY uq_event_key (event_key),
  KEY idx_events_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Who changed what on a license: for support and refund disputes
CREATE TABLE IF NOT EXISTS license_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  license_key  VARCHAR(24)  NOT NULL,
  type         ENUM('issued','renewed','revoked','restored','activated','deactivated') NOT NULL,
  order_id     VARCHAR(48)  NULL,
  device_id    VARCHAR(64)  NULL,
  detail       VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lic_events (license_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE activations
  ADD COLUMN device_label VARCHAR(80) NULL,
  ADD CONSTRAINT fk_activations_license FOREIGN KEY (license_key) REFERENCES licenses (license_key) ON DELETE CASCADE;

ALTER TABLE licenses
  ADD COLUMN revoked_at DATETIME NULL,
  ADD COLUMN revoked_reason VARCHAR(190) NULL,
  ADD KEY idx_licenses_expiry (expires_at);
