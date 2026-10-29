import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(root, 'assets/c7-device.js'), 'utf8');
const serial = new EventTarget();
const context = vm.createContext({ TextDecoder, TextEncoder, Date, setInterval, clearInterval, setTimeout, navigator: { serial } });
vm.runInContext(source, context);
const { calculateCVA, normalizePacket, SerialConnection } = context.C7Device;
const packet = (changes = {}) => {
    const result = { protocol_version: 1, boot_id: 7, calibration_id: 1, valid: true, calibrated: true, c7_angle: -2.5, head_pitch: 10, head_roll: 12, head_yaw: 20, ...changes };
    result.cva_angle = Number(calculateCVA(result.c7_angle, result.head_pitch, result.head_roll, result.head_yaw).toFixed(2));
    return result;
};
const input = packet();
const output = normalizePacket(input);
for (const key of ['c7_angle','head_pitch','head_roll','head_yaw']) assert.equal(output[key], input[key]);
for (const bad of [{}, packet({ valid: false }), packet({ calibrated: false }), packet({ calibration_id: 0 }), packet({ head_pitch: Infinity }), packet({ head_pitch: '10' }), { ...input, cva_angle: 52 }]) assert.throws(() => normalizePacket(bad));

// Compare shared scalar math to both pages' actual rendered ear midpoint geometry.
for (const name of ['index.html', 'live_test.html']) {
    const html = await readFile(resolve(root, name), 'utf8');
    function block(signature) {
        const start = html.indexOf(signature);
        assert.ok(start >= 0, signature);
        const end = html.indexOf('\n        }', start);
        return html.slice(start, end + 10);
    }
    const page = vm.createContext({ C7Device: context.C7Device });
    vm.runInContext('const DEG2RAD=Math.PI/180, RAD2DEG=180/Math.PI;' + ['class Vec3 {', 'class Quat {', 'function computeKinematics('].map(block).join('\n'), page);
    for (const c7 of [-15, -9, 0, 15, 35]) for (const pitch of [-25, 0, 30, 45]) for (const roll of [-30, 0, 30]) for (const yaw of [-40, 0, 40]) {
        const kin = vm.runInContext(`computeKinematics(${c7},${pitch},${roll},${yaw})`, page);
        const geometryCva = Math.atan2(kin.midEarPos.y, Math.max(0.15, kin.midEarPos.z)) * 180 / Math.PI;
        assert.ok(Math.abs(geometryCva - calculateCVA(c7,pitch,roll,yaw)) < 1e-10, `${name}: geometry differs`);
    }
}
console.log('PASS unchanged anatomical angles, invalid packets and both Canvas geometry models (360 fixtures)');

const tick = () => new Promise(resolve => setTimeout(resolve, 15));
function fakePort() {
    let controller;
    return {
        readable: null, writable: null, commands: [],
        async open() {
            this.readable = new ReadableStream({ start(value) { controller = value; } });
            this.writable = new WritableStream({ write: bytes => this.commands.push(new TextDecoder().decode(bytes)) });
        },
        async setSignals() {},
        async close() { this.readable = null; this.writable = null; },
        text(value) { controller.enqueue(new TextEncoder().encode(value)); },
        send(value) { this.text(JSON.stringify(value) + '\r\n'); },
        end() { controller.close(); }
    };
}
const events = [], packets = [];
const connection = new SerialConnection({ onState: value => events.push(value.kind), onPacket: value => packets.push(value) });
const first = fakePort();
try {
    await connection.connect(first);
    first.text('ESP boot log\n' + JSON.stringify(input).slice(0, 35));
    await tick(); assert.equal(packets.length, 0);
    first.text(JSON.stringify(input).slice(35) + '\n');
    await tick(); assert.equal(packets.length, 1);
    first.send(packet({ valid: false }));
    await tick(); assert.equal(events.at(-1), 'invalid'); assert.equal(packets.length, 1);
    first.send(input); await tick();
    await connection.zero(); assert.equal(first.commands.at(-1), 'z\n');
    const before = packets.length;
    first.send(input); await tick(); assert.equal(packets.length, before);
    first.send(packet({ calibration_id: 2 })); await tick(); assert.equal(packets.length, before + 1);
    assert.equal(connection.pendingZero, null);
    serial.dispatchEvent(new Event('disconnect')); await tick(); assert.equal(connection.connected, true, 'unrelated port disconnected active stream');
    first.text('x'.repeat(9000)); await tick(); assert.equal(events.at(-1), 'invalid');
    first.text('\n'); first.send(input); await tick();
    await new Promise(resolve => setTimeout(resolve, 1550)); assert.equal(events.at(-1), 'stale');
    const second = fakePort();
    await connection.connect(second);
    second.send(packet({ boot_id: 99 })); await tick();
    assert.equal(connection.lastPacket.boot_id, 99);
    second.end(); await tick(); assert.equal(connection.connected, false); assert.equal(events.at(-1), 'disconnected');
    const third = fakePort(); await connection.connect(third);
    const unplug = new Event('disconnect'); Object.defineProperty(unplug, 'port', { value: third });
    serial.dispatchEvent(unplug); await tick(); assert.equal(connection.connected, false);
    console.log('PASS chunked serial, invalid/fresh/stale, calibration acknowledgement, replacement, EOF and active-port disconnect');
} finally { await connection.disconnect(); }
