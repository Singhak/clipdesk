-- Email-verified trials: one per email and per desktop machine (see trial.php)
ALTER TABLE trials
  ADD COLUMN email_hash CHAR(64) NULL AFTER ip_hash,
  ADD COLUMN hw_hash CHAR(64) NULL AFTER email_hash,
  ADD UNIQUE KEY uq_trial_email (email_hash),
  ADD KEY idx_trial_hw (hw_hash);

CREATE TABLE IF NOT EXISTS trial_pending (
  email_hash CHAR(64)    NOT NULL PRIMARY KEY,
  device_id  VARCHAR(64) NOT NULL,
  hw_hash    CHAR(64)    NULL,
  code_hash  CHAR(64)    NOT NULL,
  attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME    NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
