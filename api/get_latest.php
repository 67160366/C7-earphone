<?php
/**
 * ============================================================================
 * API Endpoint: /C7/api/get_latest.php
 * Purpose:
 *   Returns the latest posture angle record AND the last 15 rows of history from:
 *     1. XAMPP MySQL (`c7_posture_db`.`posture_logs`) if MySQL is active
 *     2. Fallback to `/C7/api/posture_logs.csv` & `latest_angle.json`
 *   Used by `live_test.html` and `index.html` to drive the 3D neck model and
 *   display the live database log table.
 * ============================================================================
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

date_default_timezone_set('Asia/Bangkok');
require_once __DIR__ . '/config.php';

$latestFile = c7DataPath('latest_angle.json');
$csvFile    = c7DataPath('posture_logs.csv');

$mysqlConnected = false;
$row = null;
$history = [];
$totalRows = 0;

// 1. Try reading latest row & recent 15 rows from MySQL `c7_posture_db`.`posture_logs`
try {
    $pdo = c7Database();
    if ($pdo !== null) {
        $mysqlConnected = true;

        $stmt = $pdo->query("SELECT id, c7_angle, head_pitch, head_roll, head_yaw, cva_angle, created_at FROM posture_logs ORDER BY id DESC LIMIT 15");
        $dbRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($dbRows as $r) {
            $item = [
                'id'         => (int)$r['id'],
                'c7_angle'   => (float)$r['c7_angle'],
                'head_pitch' => (float)$r['head_pitch'],
                'head_roll'  => (float)$r['head_roll'],
                'head_yaw'   => (float)$r['head_yaw'],
                'cva_angle'  => (float)$r['cva_angle'],
                'created_at' => $r['created_at']
            ];
            $history[] = $item;
        }
        if (count($history) > 0) {
            $row = $history[0];
        }

        $countStmt = $pdo->query("SELECT COUNT(*) FROM posture_logs");
        $totalRows = (int)$countStmt->fetchColumn();
    }
} catch (Throwable $e) {
    $mysqlConnected = false;
}

// 2. Fallback to local `posture_logs.csv` if MySQL is offline or empty
if (count($history) === 0 && file_exists($csvFile)) {
    $lines = @file($csvFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines) && count($lines) > 1) {
        $dataLines = array_slice($lines, 1); // skip header
        $totalRows = count($dataLines);
        $recentLines = array_reverse(array_slice($dataLines, -15));
        foreach ($recentLines as $line) {
            $cols = str_getcsv($line);
            if (count($cols) >= 7) {
                $history[] = [
                    'id'         => (int)$cols[0],
                    'c7_angle'   => (float)$cols[1],
                    'head_pitch' => (float)$cols[2],
                    'head_roll'  => (float)$cols[3],
                    'head_yaw'   => (float)$cols[4],
                    'cva_angle'  => (float)$cols[5],
                    'created_at' => $cols[6]
                ];
            }
        }
        if (count($history) > 0) {
            $row = $history[0];
        }
    }
}

// 3. Fallback to `latest_angle.json`
if ($row === null && file_exists($latestFile)) {
    $cached = @json_decode(@file_get_contents($latestFile), true);
    if (is_array($cached) && isset($cached['c7_angle'])) {
        $row = [
            'id'         => (int)($cached['id'] ?? 1),
            'c7_angle'   => (float)$cached['c7_angle'],
            'head_pitch' => (float)$cached['head_pitch'],
            'head_roll'  => (float)$cached['head_roll'],
            'head_yaw'   => (float)$cached['head_yaw'],
            'cva_angle'  => (float)$cached['cva_angle'],
            'created_at' => $cached['created_at'] ?? date('Y-m-d H:i:s')
        ];
        $history = [$row];
    }
}

// 4. Default baseline if no record exists yet
if ($row === null) {
    $row = [
        'id'         => 1,
        'c7_angle'   => -9.00,
        'head_pitch' => 0.00,
        'head_roll'  => 0.00,
        'head_yaw'   => 0.00,
        'cva_angle'  => 52.05,
        'created_at' => date('Y-m-d H:i:s')
    ];
    $history = [$row];
}

echo json_encode([
    'status'          => 'ok',
    'source'          => $mysqlConnected ? 'MySQL + CSV Dual DB' : 'Local CSV DB (MySQL Standby)',
    'mysql_connected' => $mysqlConnected,
    'csv_exists'      => file_exists($csvFile),
    'total_rows'      => $totalRows,
    'data'            => $row,
    'history'         => $history
], JSON_UNESCAPED_UNICODE);
