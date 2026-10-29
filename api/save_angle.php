<?php
/**
 * ============================================================================
 * API Endpoint: /C7/api/save_angle.php
 * Purpose:
 *   Receives posture angle data from ESP32 (via HTTP POST JSON or GET/POST params)
 *   and saves to DUAL DATABASE STORAGE simultaneously:
 *     1. XAMPP MySQL Database: `c7_posture_db` -> table `posture_logs`
 *        (Auto-creates database & table if not yet created!)
 *     2. Local Project CSV & JSON Files:
 *        - `/Applications/XAMPP/xamppfiles/htdocs/C7/api/posture_logs.csv`
 *        - `/Applications/XAMPP/xamppfiles/htdocs/C7/api/latest_angle.json`
 * ============================================================================
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

date_default_timezone_set('Asia/Bangkok');
require_once __DIR__ . '/config.php';

// 1. Read input from JSON body (sent by ESP32) or $_POST / $_GET parameters
$rawBody = file_get_contents('php://input');
$jsonData = json_decode($rawBody, true);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false
    && (!is_array($jsonData) || !str_starts_with(ltrim($rawBody), '{'))) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Expected a valid JSON object']);
    exit;
}
$input = is_array($jsonData) ? $jsonData : array_merge($_GET, $_POST);

if (!array_key_exists('c7_angle', $input) && !array_key_exists('head_pitch', $input) && !array_key_exists('cva_angle', $input)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Missing angle parameters. Send JSON: {"c7_angle":-9.0,"head_pitch":0.0,"head_roll":0.0,"head_yaw":0.0,"cva_angle":52.05}'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Protocol 1 is calibrated anatomical telemetry, never raw sensor data.
$isDeviceTelemetry = array_key_exists('protocol_version', $input);
if ($isDeviceTelemetry) {
    if ($input['protocol_version'] !== 1 || ($input['valid'] ?? null) !== true
        || ($input['calibrated'] ?? null) !== true
        || !is_int($input['calibration_id'] ?? null) || $input['calibration_id'] < 1
        || $input['calibration_id'] > 9007199254740991) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Unsupported, invalid or uncalibrated telemetry']);
        exit;
    }
    $limits = ['c7_angle' => [-15, 35], 'head_pitch' => [-25, 45],
        'head_roll' => [-30, 30], 'head_yaw' => [-40, 40]];
    foreach ($limits as $field => [$minimum, $maximum]) {
        if (!array_key_exists($field, $input) || (!is_int($input[$field]) && !is_float($input[$field]))
            || !is_finite((float)$input[$field]) || $input[$field] < $minimum || $input[$field] > $maximum) {
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => $field . ' must be a JSON number within firmware limits']);
            exit;
        }
    }
    if (array_key_exists('cva_angle', $input) && !is_int($input['cva_angle']) && !is_float($input['cva_angle'])) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'cva_angle must be a JSON number']);
        exit;
    }
}
foreach (['c7_angle', 'head_pitch', 'head_roll', 'head_yaw', 'cva_angle'] as $field) {
    if (array_key_exists($field, $input) && (!is_numeric($input[$field]) || !is_finite((float)$input[$field]))) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => $field . ' must be a finite number']);
        exit;
    }
    if (array_key_exists($field, $input) && (abs((float)$input[$field]) > 180
        || ($field === 'cva_angle' && (float)$input[$field] < 0))) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => $field . ' is outside the supported degree range']);
        exit;
    }
}
$c7_angle   = round((float)($input['c7_angle'] ?? -9.00), 2);
$head_pitch = round((float)($input['head_pitch'] ?? 0.00), 2);
$head_roll  = round((float)($input['head_roll'] ?? 0.00), 2);
$head_yaw   = round((float)($input['head_yaw'] ?? 0.00), 2);

// Device telemetry must agree with the shared model; normalize accepted rounding noise.
$canonicalCva = c7CalculateCva($c7_angle, $head_pitch, $head_roll, $head_yaw);
if ($isDeviceTelemetry && isset($input['cva_angle']) && abs((float)$input['cva_angle'] - $canonicalCva) > 0.1) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Firmware CVA does not match the shared model']);
    exit;
}
if (!$isDeviceTelemetry && isset($input['cva_angle'])) {
    $cva_angle = round((float)$input['cva_angle'], 2);
} else {
    $cva_angle = round($canonicalCva, 2);
}

$timestamp = date('Y-m-d H:i:s');
$mysqlSaved = false;
$mysqlId = null;
$mysqlError = null;

// ============================================================================
// STORAGE #1: Save to XAMPP MySQL (`c7_posture_db`.`posture_logs`)
// ============================================================================
try {
    $pdo = c7Database(false);
    if ($pdo !== null) {
        $database = c7Config('C7_DB_NAME', 'c7_posture_db');

        // Auto-create database & table if they do not exist yet
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `{$database}`");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS posture_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                c7_angle FLOAT NOT NULL,
                head_pitch FLOAT NOT NULL,
                head_roll FLOAT NOT NULL,
                head_yaw FLOAT NOT NULL,
                cva_angle FLOAT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        $stmt = $pdo->prepare("
            INSERT INTO posture_logs (c7_angle, head_pitch, head_roll, head_yaw, cva_angle, created_at)
            VALUES (:c7, :pitch, :roll, :yaw, :cva, :ts)
        ");
        $stmt->execute([
            ':c7'    => $c7_angle,
            ':pitch' => $head_pitch,
            ':roll'  => $head_roll,
            ':yaw'   => $head_yaw,
            ':cva'   => $cva_angle,
            ':ts'    => $timestamp
        ]);

        $mysqlId = (int)$pdo->lastInsertId();
        $mysqlSaved = true;
    }
} catch (Throwable $e) {
    $mysqlError = $e->getMessage();
}

// ============================================================================
// STORAGE #2: Save to Local CSV (`posture_logs.csv`) & `latest_angle.json`
// ============================================================================
try {
    $csvFile = c7DataPath('posture_logs.csv');
    $latestFile = c7DataPath('latest_angle.json');
    // Serialize local ID allocation and the CSV/cache update as one writer operation.
    $storageLock = @fopen(c7DataPath('.storage.lock'), 'c');
    if (!$storageLock || !flock($storageLock, LOCK_EX)) {
        throw new RuntimeException('Cannot lock local storage');
    }
} catch (Throwable $e) {
    http_response_code($mysqlSaved ? 200 : 500);
    echo json_encode(['status' => $mysqlSaved ? 'ok' : 'error', 'id' => $mysqlId,
        'c7_angle' => $c7_angle, 'head_pitch' => $head_pitch, 'head_roll' => $head_roll,
        'head_yaw' => $head_yaw, 'cva_angle' => $cva_angle, 'created_at' => $timestamp,
        'mysql_saved' => $mysqlSaved, 'mysql_error' => $mysqlError,
        'csv_saved' => false, 'latest_saved' => false, 'storage_error' => 'Local storage unavailable']);
    exit;
}

// Determine sequential ID if MySQL is offline
$prevLatest = @json_decode(@file_get_contents($latestFile), true);
$lastLocalId = max((int)($prevLatest['id'] ?? 0), c7LastCsvId($csvFile));
$recordId = $mysqlId !== null ? $mysqlId : $lastLocalId + 1;

$isNewCsv = !file_exists($csvFile) || filesize($csvFile) === 0;
$csvSaved = false;

if ($fp = @fopen($csvFile, 'a')) {
    if (flock($fp, LOCK_EX)) {
        if ($isNewCsv) {
            $headerSaved = fputcsv($fp, ['id', 'c7_angle', 'head_pitch', 'head_roll', 'head_yaw', 'cva_angle', 'created_at']) !== false;
        } else {
            $headerSaved = true;
        }
        $rowSaved = $headerSaved && fputcsv($fp, [$recordId, $c7_angle, $head_pitch, $head_roll, $head_yaw, $cva_angle, $timestamp]) !== false;
        $csvSaved = $rowSaved && fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

$latestPayload = [
    'status'          => ($mysqlSaved || $csvSaved) ? 'ok' : 'error',
    'id'              => $recordId,
    'c7_angle'        => $c7_angle,
    'head_pitch'      => $head_pitch,
    'head_roll'       => $head_roll,
    'head_yaw'        => $head_yaw,
    'cva_angle'       => $cva_angle,
    'created_at'      => $timestamp,
    'mysql_saved'     => $mysqlSaved,
    'csv_saved'       => $csvSaved,
    'mysql_error'     => $mysqlError,
    'latest_saved'    => true
];

// Rename a complete temporary cache instead of exposing a partially written JSON file.
$temporary = @tempnam(dirname($latestFile), '.latest-');
$latestSaved = $temporary !== false
    && @file_put_contents($temporary, json_encode($latestPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false
    && @rename($temporary, $latestFile);
if (!$latestSaved) {
    if ($temporary !== false && is_file($temporary)) { @unlink($temporary); }
    $latestPayload['latest_saved'] = false;
}
if (!$csvSaved || !$latestSaved) {
    $latestPayload['storage_error'] = 'One or more local storage writes failed';
}
flock($storageLock, LOCK_UN);
fclose($storageLock);
if ($latestPayload['status'] !== 'ok') { http_response_code(500); }

echo json_encode($latestPayload, JSON_UNESCAPED_UNICODE);
