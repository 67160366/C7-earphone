<?php
// Local explicit zero only. The existing watcher owns serial and verifies the device ACK.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function calibrationError(int $code, string $error): never {
    http_response_code($code);exit(json_encode(['error' => $error]));
}
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) calibrationError(403, 'LOCAL_ONLY');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') calibrationError(405, 'POST_REQUIRED');
// A custom header + JSON blocks cross-origin form requests; no CORS permission is granted.
if (($_SERVER['HTTP_X_C7_CONTROL'] ?? '') !== 'calibrate' || !str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) calibrationError(403, 'INVALID_CONTROL_REQUEST');
$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin !== null && $origin !== 'http://' . ($_SERVER['HTTP_HOST'] ?? '')) calibrationError(403, 'ORIGIN_REJECTED');
$runtime = dirname(__DIR__) . '/.local/hardware-monitor';
$state = json_decode((string) @file_get_contents($runtime . '/status.json'), true);
$stamp = strtotime($state['updated_at'] ?? '');
if (!$stamp || time()-$stamp > 3 || time()-$stamp < -1 || ($state['calibration_supported'] ?? false) !== true) calibrationError(409, 'MONITOR_OFFLINE');
if (($state['connected'] ?? false) !== true || ($state['valid'] ?? false) !== true || ($state['frame_age_seconds'] ?? 999) > 1.2) calibrationError(409, 'SENSOR_NOT_READY');
if (($state['calibration']['state'] ?? '') === 'sent') calibrationError(409, 'CALIBRATION_PENDING');
$request = ['id' => bin2hex(random_bytes(16)), 'created_at' => microtime(true), 'boot_id' => $state['boot_id'], 'calibration_id' => $state['calibration_id']];
$file = @fopen($runtime . '/calibrate.request.json', 'x');
if (!$file) calibrationError(409, 'CALIBRATION_PENDING');
$json = json_encode($request);
$written = fwrite($file, $json);fclose($file);
if ($written !== strlen($json)) {@unlink($runtime . '/calibrate.request.json');calibrationError(500, 'QUEUE_WRITE_FAILED');}
http_response_code(202);
echo json_encode(['id' => $request['id'], 'state' => 'queued']);
