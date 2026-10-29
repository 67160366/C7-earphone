<?php
if (PHP_VERSION_ID < 80000 || !extension_loaded('json') || !extension_loaded('PDO')) {
    fwrite(STDERR, "PHP 8+ with JSON and PDO is required\n");
    exit(1);
}
echo 'PHP ', PHP_VERSION, " ready\n";
echo 'pdo_mysql: ', extension_loaded('pdo_mysql') ? 'available' : 'not installed (CSV mode still works)', "\n";
