-- Per-IP request counters for the public endpoints (see rate_limit() in lib/bootstrap.php)
CREATE TABLE IF NOT EXISTS rate_limits (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bucket      VARCHAR(64) NOT NULL,
  subject     CHAR(64)    NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rate (bucket, subject, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
