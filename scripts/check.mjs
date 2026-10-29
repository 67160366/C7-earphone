// Dependency-free setup regression check; writes only to a unique temporary directory.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rename, rm, mkdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const directory of ['api', 'scripts']) {
    for (const name of await readdir(join(root, directory))) {
        if (!name.endsWith('.php')) continue;
        const result = spawnSync('php', ['-l', join(root, directory, name)], { encoding: 'utf8', windowsHide: true });
        assert.equal(result.status, 0, result.stderr || result.error?.message);
    }
}
for (const name of ['index.html', 'live_test.html', 'wiring_guide.html']) {
    const html = await readFile(join(root, name), 'utf8');
    let number = 0;
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        new Script(script, { filename: `${name}:script-${++number}` });
    }
}
console.log('PASS PHP and inline JavaScript syntax');

const dataDir = await mkdtemp(join(tmpdir(), 'c7-check-'));
const reservation = createServer();
await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let diagnostics = '';
const startServer = overrides => {
    const child = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root, join(root, 'scripts/router.php')], {
    cwd: root, windowsHide: true,
    env: { ...process.env, C7_MYSQL_ENABLED: '0', C7_DATA_DIR: dataDir, ...overrides },
    stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    child.on('error', error => { diagnostics += error.message; });
    return child;
};
let server = startServer({});
const stopServer = async () => {
    if (server.exitCode !== null) return;
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await stopped;
};
const base = `http://127.0.0.1:${port}`;
const get = async path => {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    return response.json();
};
const save = async payload => {
    const response = await fetch(base + '/api/save_angle.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    return response.json();
};
const waitForServer = async () => {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        try { await get('/api/get_latest.php'); ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, `PHP server did not start: ${diagnostics}`);
};
try {
    await waitForServer();
    const initial = await get('/api/get_latest.php');
    assert.equal(initial.total_rows, 0);
    assert.equal(initial.mysql_connected, false);
    assert.equal(initial.data.cva_angle, 52.05);
    for (const path of ['/', '/index.html', '/live_test.html', '/wiring_guide.html']) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200, path);
        assert.match(await response.text(), /<html lang="th">/);
    }
    for (const path of ['/.env', '/.git/config', '/.init', '/HANDOFF.md', '/api/config.php', '/api/db_init.sql']) {
        assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base + '/api/posture_logs.csv')).status, 404);
    assert.equal((await fetch(base + '/api/save_angle.php')).status, 400);
    const preflight = await fetch(base + '/api/save_angle.php', { method: 'OPTIONS' });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    console.log('PASS pages, empty baseline, route protection, missing input and CORS preflight');

    const first = await save({ c7_angle: -9, head_pitch: 0, head_roll: 2.34, head_yaw: -5, cva_angle: 52.05 });
    assert.equal(first.id, 1);
    assert.equal(first.csv_saved, true);
    assert.equal(first.mysql_saved, false);
    assert.equal(first.mysql_error, null);
    const latest = await get('/api/get_latest.php');
    assert.equal(latest.total_rows, 1);
    for (const key of ['id', 'c7_angle', 'head_pitch', 'head_roll', 'head_yaw', 'cva_angle']) {
        assert.equal(latest.data[key], first[key], key);
    }
    const validTelemetry = { protocol_version: 1, calibration_id: 1, valid: true, calibrated: true,
        c7_angle: -9, head_pitch: 0, head_roll: 0, head_yaw: 0 };
    const invalidPayloads = [
        { ...validTelemetry, valid: false }, { ...validTelemetry, calibrated: false },
        { ...validTelemetry, protocol_version: 2 }, { ...validTelemetry, calibration_id: -1 },
        { ...validTelemetry, calibration_id: 0 },
        { ...validTelemetry, calibration_id: Number.MAX_SAFE_INTEGER + 1 },
        ...['c7_angle', 'head_pitch', 'head_roll', 'head_yaw'].map(key => ({ ...validTelemetry, [key]: '0' })),
        ...Object.entries({ c7_angle: [-15.01,35.01], head_pitch: [-25.01,45.01], head_roll: [-30.01,30.01], head_yaw: [-40.01,40.01] })
            .flatMap(([key, values]) => values.map(value => ({ ...validTelemetry, [key]: value }))),
        { ...validTelemetry, cva_angle: 52.16 }, { ...validTelemetry, cva_angle: '52.05' },
        { ...validTelemetry, valid: 'true' }, { protocol_version: 1, calibration_id: 1, valid: true, calibrated: true, c7_angle: -9 },
        { c7_angle: 'garbage' }, { c7_angle: 'NaN' }, { head_pitch: 'Infinity' },
        { c7_angle: [] }, { c7_angle: null }, { head_pitch: true },
        { c7_angle: 1e308 }, { c7_angle: 0, cva_angle: -1 },
    ];
    for (const payload of invalidPayloads) {
        const response = await fetch(base + '/api/save_angle.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        assert.equal(response.status, 422, JSON.stringify(payload));
        assert.equal((await response.json()).status, 'error');
    }
    for (const raw of ['{', '[]', 'null']) {
        const response = await fetch(base + '/api/save_angle.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).status, 'error');
    }
    assert.equal((await get('/api/get_latest.php')).total_rows, 1, 'Rejected input must not be saved');
    console.log('PASS rejects invalid/un-calibrated protocol telemetry and malformed/non-finite angles without writing');
    const calculated = await save({ c7_angle: -9, head_pitch: 0 });
    assert.ok(Math.abs(calculated.cva_angle - 52.05) < 0.02);
    for (let i = 0; i < 16; i++) await save({ c7_angle: i, head_pitch: i / 2 });
    const history = await get('/api/get_latest.php');
    assert.equal(history.total_rows, 18);
    assert.equal(history.history.length, 15);
    assert.equal(history.history[0].id, 18);
    assert.equal(history.history[14].id, 4);
    const csv = await (await fetch(base + '/api/posture_logs.csv')).text();
    assert.equal(csv.trim().split('\n').length, 19);
    assert.equal(csv, await readFile(join(dataDir, 'posture_logs.csv'), 'utf8'));
    assert.equal((await get('/api/latest_angle.json')).id, 18);
    await rename(join(dataDir, 'posture_logs.csv'), join(dataDir, 'history.backup'));
    const cached = await get('/api/get_latest.php');
    assert.equal(cached.data.id, 18);
    assert.equal(cached.history.length, 1);
    console.log('PASS POST -> CSV/JSON -> latest/history, calculated CVA and JSON cache fallback');
    for (const [angles, expectedCva] of [
        [[-9, 0, 0, 0], 52.05218689015597],
        [[-2.5, 10, 12, 20], 46.13094221199768],
        [[-9, 30, 0, 0], 45.13800333994315],
        [[22, -2, 0, 0], 36.596146436754275],
        [[-9, 0, 30, 40], 50.07054433321924],
    ]) {
        const [c7_angle, head_pitch, head_roll, head_yaw] = angles;
        const sample = await save({ ...validTelemetry, c7_angle, head_pitch, head_roll, head_yaw });
        assert.ok(Math.abs(sample.cva_angle - expectedCva) <= 0.0051, `CVA geometry parity: ${angles}`);
        assert.equal(sample.latest_saved, true);
    }
    console.log('PASS calibrated protocol telemetry and PHP CVA geometry parity fixtures');
    const normalizedCva = await save({ ...validTelemetry, cva_angle: 52.10 });
    assert.equal(normalizedCva.cva_angle, 52.05, 'Accepted device CVA rounding noise must store canonical result');
    for (const angles of [[-15,-25,-30,-40], [35,45,30,40]]) {
        const [c7_angle, head_pitch, head_roll, head_yaw] = angles;
        const boundary = await save({ ...validTelemetry, c7_angle, head_pitch, head_roll, head_yaw });
        assert.equal(boundary.status, 'ok', 'Inclusive firmware limits');
    }
    const legacyCva = await save({ c7_angle: '-9', cva_angle: '50.12' });
    assert.equal(legacyCva.cva_angle, 50.12, 'Legacy numeric strings and supplied CVA remain compatible');
    console.log('PASS strict device ranges/types, canonical CVA normalization and legacy compatibility');
    const beforeFailure = await get('/api/get_latest.php');
    const latestPath = join(dataDir, 'latest_angle.json');
    await rename(latestPath, join(dataDir, 'latest.backup'));
    await mkdir(latestPath);
    const partial = await save({ c7_angle: -9 });
    assert.equal(partial.csv_saved, true);
    assert.equal(partial.latest_saved, false);
    assert.equal(typeof partial.storage_error, 'string');
    const continued = await save({ c7_angle: -8 });
    assert.equal(continued.id, partial.id + 1, 'CSV sequence must survive a failed latest-cache write');
    assert.equal(partial.id, beforeFailure.data.id + 1);
    await rename(join(dataDir, 'posture_logs.csv'), join(dataDir, 'csv.backup'));
    await mkdir(join(dataDir, 'posture_logs.csv'));
    const failedSave = await fetch(base + '/api/save_angle.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c7_angle: -9 }),
    });
    assert.equal(failedSave.status, 500);
    const failedBody = await failedSave.json();
    assert.equal(failedBody.status, 'error');
    assert.equal(failedBody.csv_saved, false);
    assert.equal(failedBody.latest_saved, false);
    // These exact paths are empty failure fixtures inside our unique temporary directory.
    assert.equal(dirname(latestPath), dataDir);
    await rmdir(latestPath);
    await rmdir(join(dataDir, 'posture_logs.csv'));
    await rename(join(dataDir, 'latest.backup'), latestPath);
    await rename(join(dataDir, 'csv.backup'), join(dataDir, 'posture_logs.csv'));
    console.log('PASS truthful partial/failed writes and sequence recovery after cache failure');
    await stopServer();
    server = startServer({ C7_MYSQL_ENABLED: '1', C7_DB_HOST: '127.0.0.1', C7_DB_PORT: '1', C7_DB_SOCKET: '', C7_DB_NAME: 'c7_check' });
    await waitForServer();
    const fallback = await save({ c7_angle: -9 });
    assert.equal(fallback.mysql_saved, false);
    assert.equal(fallback.csv_saved, true);
    assert.equal(typeof fallback.mysql_error, 'string');
    assert.equal((await get('/api/get_latest.php')).data.id, fallback.id);
    console.log('PASS file fallback with unavailable MySQL connection');
    console.log('All checks passed. A working MySQL database and physical ESP32 are not exercised by this check.');
} finally {
    await stopServer();
    // dataDir was created exclusively by this check under the OS temporary directory.
    assert.equal(dirname(resolve(dataDir)), resolve(tmpdir()));
    await rm(dataDir, { recursive: true, force: true });
}
