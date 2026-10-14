<?php
declare(strict_types=1);

// Applies pending migrations/*.sql in order and records them in schema_migrations.
// Usage: php bin/migrate.php        (CLI only; run from hPanel SSH or any machine that can reach the DB)
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$pdo = db();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

$done = $pdo->query('SELECT name FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(__DIR__ . '/../migrations/*.sql') ?: [];
sort($files);

$applied = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (in_array($name, $done, true)) {
        continue;
    }
    // Drop -- comment lines first so a ';' inside a comment can't split a statement
    $sql = preg_replace('/^\s*--.*$/m', '', (string)file_get_contents($file));
    echo "Applying $name\n";
    // MySQL DDL auto-commits, so a failure leaves earlier statements of this file applied
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        $pdo->exec($statement);
    }
    $pdo->prepare('INSERT INTO schema_migrations (name) VALUES (?)')->execute([$name]);
    $applied++;
}
echo $applied === 0 ? "Database is up to date.\n" : "Applied $applied migration(s).\n";
