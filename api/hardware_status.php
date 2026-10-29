<?php
// Local, read-only view of the serial watcher's snapshot; never expose IDs or raw logs.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    exit(json_encode(['valid' => false, 'health' => 'LOCAL_ONLY']));
}
$file = dirname(__DIR__) . '/.local/hardware-monitor/status.json';
$state = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
$updated = is_array($state) ? strtotime($state['updated_at'] ?? '') : false;
$heartbeatAge = $updated === false ? null : time() - $updated;
$fresh = $heartbeatAge !== null && $heartbeatAge >= -1 && $heartbeatAge <= 3;
$sensors = is_array($state['sensors'] ?? null) ? $state['sensors'] : [];
$headFresh = ($sensors['left_fresh'] ?? false) === true || ($sensors['right_fresh'] ?? false) === true;
$valid = $fresh && ($state['connected'] ?? false) === true && ($state['valid'] ?? false) === true
    && is_numeric($state['frame_age_seconds'] ?? null) && $state['frame_age_seconds'] <= 1.2 && $headFresh;
$angles = [];
foreach (['head_pitch', 'head_roll', 'head_yaw', 'c7_angle', 'cva_angle'] as $key) {
    $value = $state['angles'][$key] ?? null;
    if (!is_numeric($value) || !is_finite((float) $value)) { $valid = false; }
    $angles[$key] = $value;
}
echo json_encode([
    'valid' => $valid,
    'health' => !$fresh ? 'MONITOR_OFFLINE' : ($state['health'] ?? 'WAITING_FOR_DATA'),
    'updated_at' => $state['updated_at'] ?? null,
    'session' => $fresh ? hash('sha256', (string) ($state['boot_id'] ?? '') . ':' . (string) ($state['calibration_id'] ?? '')) : null,
    'sensors' => $fresh ? $sensors : [],
    'angles' => $valid ? $angles : null,
    'calibration_supported' => $fresh && ($state['calibration_supported'] ?? false) === true,
    'calibration' => $fresh ? ($state['calibration'] ?? null) : null,
], JSON_UNESCAPED_UNICODE);
