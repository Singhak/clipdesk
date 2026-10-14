-- Baseline: licenses, orders, activations, trials (MySQL 5.7+ / MariaDB 10.3+)

CREATE TABLE IF NOT EXISTS licenses (
  license_key  VARCHAR(24)  NOT NULL PRIMARY KEY,
  email        VARCHAR(190) NOT NULL,
  plan         ENUM('monthly','lifetime') NOT NULL,
  expires_at   DATETIME     NULL,          -- NULL = never expires
  max_devices  TINYINT UNSIGNED NOT NULL DEFAULT 3,
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  order_id     VARCHAR(48)  NOT NULL PRIMARY KEY,
  email        VARCHAR(190) NOT NULL,
  plan         ENUM('monthly','lifetime') NOT NULL,
  amount_inr   DECIMAL(10,2) NOT NULL,
  status       ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  renew_key    VARCHAR(24)  NULL,          -- set when a monthly pass extends an existing key
  license_key  VARCHAR(24)  NULL,          -- filled once paid
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at      DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activations (
  license_key  VARCHAR(24)  NOT NULL,
  device_id    VARCHAR(64)  NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (license_key, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trials (
  device_id    VARCHAR(64)  NOT NULL PRIMARY KEY,
  ip_hash      CHAR(64)     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ip (ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
