<?php
// Allowlist for the local PHP development server; never serve .env or .git.
require_once dirname(__DIR__) . '/api/config.php';
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
$pages = ['/' => 'index.html', '/index.html' => 'index.html',
    '/live_test.html' => 'live_test.html', '/wiring_guide.html' => 'wiring_guide.html',
    '/sensor_demo.html' => 'sensor_demo.html'];
$demoAssets = [
    '/assets/sensor-demo.js' => 'application/javascript',
    '/assets/demo-posture.js' => 'application/javascript',
    '/assets/sensor-demo.css' => 'text/css',
    '/assets/vendor/three/three.module.js' => 'application/javascript',
    '/assets/vendor/three/three.core.js' => 'application/javascript',
    '/assets/vendor/three/OrbitControls.js' => 'application/javascript',
    '/assets/vendor/three/GLTFLoader.js' => 'application/javascript',
    '/assets/vendor/three/utils/BufferGeometryUtils.js' => 'application/javascript',
    '/assets/vendor/three/utils/SkeletonUtils.js' => 'application/javascript',
    '/assets/models/head/LeePerrySmith.glb' => 'model/gltf-binary',
    '/assets/models/head/Infinite-Level_02_Tangent_SmoothUV.jpg' => 'image/jpeg',
];
if (isset($demoAssets[$path])) {
    header('Content-Type: ' . $demoAssets[$path]);
    readfile(dirname(__DIR__) . $path);
} elseif ($path === '/assets/c7-device.js') {
    header('Content-Type: application/javascript; charset=utf-8');
    readfile(dirname(__DIR__) . '/assets/c7-device.js');
} elseif (isset($pages[$path])) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(dirname(__DIR__) . '/' . $pages[$path]);
} elseif (in_array($path, ['/api/save_angle.php', '/api/get_latest.php', '/api/hardware_status.php', '/api/hardware_calibrate.php'], true)) {
    require dirname(__DIR__) . $path;
} elseif (in_array($path, ['/api/posture_logs.csv', '/api/latest_angle.json'], true)) {
    $file = c7DataPath(basename($path));
    if (!is_file($file)) {
        http_response_code(404);
        exit('No records saved yet');
    }
    header('Content-Type: ' . (str_ends_with($path, '.csv') ? 'text/csv; charset=utf-8' : 'application/json'));
    header('Cache-Control: no-store');
    readfile($file);
} else {
    http_response_code(404);
    echo 'Not found';
}
return true;
