<?php
// Environment variables take precedence over the optional project .env file.
function c7Config(string $name, string $default): string
{
    static $settings = null;
    if ($settings === null) {
        $file = dirname(__DIR__) . '/.env';
        $settings = is_file($file) ? parse_ini_file($file, false, INI_SCANNER_RAW) : [];
        if ($settings === false) {
            throw new RuntimeException('Invalid .env configuration');
        }
    }
    $value = getenv($name);
    return $value !== false ? $value : (string)($settings[$name] ?? $default);
}

function c7DataPath(string $filename): string
{
    $directory = c7Config('C7_DATA_DIR', __DIR__);
    if (!preg_match('~^(?:[A-Za-z]:[\\\\/]|/|\\\\\\\\)~', $directory)) {
        $directory = dirname(__DIR__) . '/' . $directory;
    }
    if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Cannot create data directory');
    }
    return rtrim($directory, '/\\') . '/' . $filename;
}

function c7Database(bool $selectDatabase = true): ?PDO
{
    if (!filter_var(c7Config('C7_MYSQL_ENABLED', '1'), FILTER_VALIDATE_BOOLEAN)) {
        return null;
    }
    $name = c7Config('C7_DB_NAME', 'c7_posture_db');
    if (!preg_match('/^[A-Za-z0-9_]+$/', $name)) {
        throw new RuntimeException('C7_DB_NAME must contain only letters, digits and underscores');
    }
    $socket = c7Config('C7_DB_SOCKET', '/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock');
    $address = file_exists($socket)
        ? 'unix_socket=' . $socket
        : 'host=' . c7Config('C7_DB_HOST', '127.0.0.1') . ';port=' . c7Config('C7_DB_PORT', '3306');
    $dsn = 'mysql:' . $address . ($selectDatabase ? ';dbname=' . $name : '') . ';charset=utf8mb4';
    return new PDO($dsn, c7Config('C7_DB_USER', 'root'), c7Config('C7_DB_PASSWORD', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 2,
    ]);
}

// Same Y * X * Z quaternion rotation and ear midpoint geometry as both dashboards.
function c7RotateVector(array $v, float $pitch, float $yaw, float $roll): array
{
    $rx = deg2rad($pitch) * 0.5;
    $ry = deg2rad($yaw) * 0.5;
    $rz = deg2rad($roll) * 0.5;
    $cx = cos($rx); $sx = sin($rx);
    $cy = cos($ry); $sy = sin($ry);
    $cz = cos($rz); $sz = sin($rz);
    $w = $cy * $cx * $cz + $sy * $sx * $sz;
    $x = $cy * $sx * $cz + $sy * $cx * $sz;
    $y = $sy * $cx * $cz - $cy * $sx * $sz;
    $z = $cy * $cx * $sz - $sy * $sx * $cz;
    $uv = [$y * $v[2] - $z * $v[1], $z * $v[0] - $x * $v[2], $x * $v[1] - $y * $v[0]];
    $uuv = [$y * $uv[2] - $z * $uv[1], $z * $uv[0] - $x * $uv[2], $x * $uv[1] - $y * $uv[0]];
    return [$v[0] + 2 * ($w * $uv[0] + $uuv[0]),
        $v[1] + 2 * ($w * $uv[1] + $uuv[1]),
        $v[2] + 2 * ($w * $uv[2] + $uuv[2])];
}

function c7CalculateCva(float $c7, float $pitch, float $roll, float $yaw): float
{
    $neckTilt = 4.2 + $c7 * 1.02 + max(0.0, $pitch * 0.16);
    $neck = c7RotateVector([0.0, 0.985, 0.0], $neckTilt, $yaw * 0.35, $roll * 0.4);
    $ear = c7RotateVector([0.0, 0.12, 0.2505], $pitch, $yaw, $roll);
    return rad2deg(atan2(0.04 + $neck[1] + $ear[1], max(0.15, 0.725 + $neck[2] + $ear[2])));
}

// API CSV rows are short and newline-free. Inspect the tail without loading a growing log.
function c7LastCsvId(string $file): int
{
    if (!is_file($file)) { return 0; }
    $handle = @fopen($file, 'r');
    if (!$handle) { return 0; }
    $size = fstat($handle)['size'];
    fseek($handle, max(0, $size - 4096));
    $tail = stream_get_contents($handle);
    fclose($handle);
    $lines = preg_split('/\r?\n/', rtrim($tail));
    $columns = str_getcsv(end($lines));
    return isset($columns[0]) && ctype_digit($columns[0]) ? (int)$columns[0] : 0;
}
