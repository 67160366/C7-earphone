/* Shared offline telemetry contract. Firmware owns calibration and anatomical axes. */
(function (scope) {
    'use strict';
    const RAD = Math.PI / 180;
    function rotate(vector, pitch, yaw, roll) {
        const [sx, sy, sz] = [pitch, yaw, roll].map(v => Math.sin(v * RAD / 2));
        const [cx, cy, cz] = [pitch, yaw, roll].map(v => Math.cos(v * RAD / 2));
        const w = cy * cx * cz + sy * sx * sz;
        const q = [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz];
        const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        const uv = cross(q, vector), uuv = cross(q, uv);
        return vector.map((v, i) => v + 2 * w * uv[i] + 2 * uuv[i]);
    }
    function calculateCVA(c7, pitch, roll, yaw) {
        const neck = rotate([0, 0.985, 0], 4.2 + c7 * 1.02 + Math.max(0, pitch * 0.16), yaw * 0.35, roll * 0.4);
        const ear = rotate([0, 0.12, 0.2505], pitch, yaw, roll);
        return Math.atan2(0.04 + neck[1] + ear[1], Math.max(0.15, 0.725 + neck[2] + ear[2])) / RAD;
    }
    function normalizePacket(packet) {
        if (!packet || packet.protocol_version !== 1) throw new Error('ต้องอัปโหลด firmware protocol v1 ก่อนใช้ USB');
        if (packet.valid !== true || packet.calibrated !== true) throw new Error('เซ็นเซอร์ยังไม่พร้อม / ข้อมูลหมดอายุ / รอตั้งศูนย์');
        if (!Number.isSafeInteger(packet.calibration_id) || packet.calibration_id < 1) throw new Error('calibration_id ไม่ถูกต้อง');
        const limits = { c7_angle: [-15,35], head_pitch: [-25,45], head_roll: [-30,30], head_yaw: [-40,40] };
        for (const [key, [min, max]] of Object.entries(limits)) {
            if (typeof packet[key] !== 'number' || !Number.isFinite(packet[key]) || packet[key] < min || packet[key] > max) throw new Error('มุมเซ็นเซอร์ไม่ถูกต้อง: ' + key);
        }
        const cva = calculateCVA(packet.c7_angle, packet.head_pitch, packet.head_roll, packet.head_yaw);
        if (!Number.isFinite(packet.cva_angle) || Math.abs(packet.cva_angle - cva) > 0.1) throw new Error('สูตร CVA ของ firmware ไม่ตรงกับ dashboard');
        return { ...packet, cva_angle: Math.round(cva * 100) / 100 };
    }
    class SerialConnection {
        constructor({ onPacket, onState }) {
            this.onPacket = onPacket;
            this.onState = onState;
            this.generation = 0;
            this.port = null;
            this.reader = null;
            this.lastPacket = null;
            this.pendingZero = null;
            this.connected = false;
        }
        state(kind, message) { this.onState({ kind, message }); }
        async connect(port) {
            await this.disconnect();
            const generation = ++this.generation;
            if (!port.readable) await port.open({ baudRate: 115200 });
            try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch {}
            this.port = port;
            this.connected = true;
            this.lastPacket = null;
            this.pendingZero = null;
            this.lastReceived = Date.now();
            this.state('waiting', 'รอ firmware v1 และข้อมูลเซ็นเซอร์ที่ตั้งศูนย์แล้ว');
            this.disconnectListener = event => {
                if (event.target === port || event.port === port) this.disconnect().catch(() => {});
            };
            if (typeof navigator !== 'undefined' && navigator.serial) navigator.serial.addEventListener('disconnect', this.disconnectListener);
            this.timer = setInterval(() => {
                if (Date.now() - this.lastReceived > 1200) this.state('stale', 'ไม่ได้รับข้อมูลที่ใช้ได้จาก ESP32 เกิน 1.2 วินาที');
                if (this.pendingZero && Date.now() - this.pendingZero.started > 5000) this.state('calibrating', 'ยังไม่ได้รับการยืนยันตั้งศูนย์จาก ESP32 กรุณาตรวจเซ็นเซอร์');
            }, 300);
            this.running = this.readLoop(generation);
        }
        async readLoop(generation) {
            let buffer = '', failures = 0;
            const decoder = new TextDecoder();
            try {
                while (this.connected && this.generation === generation && this.port.readable) {
                    const reader = this.port.readable.getReader();
                    this.reader = reader;
                    try {
                        while (this.generation === generation && this.connected) {
                            const { value, done } = await reader.read();
                            if (done) return;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split(/\r?\n/);
                            buffer = lines.pop();
                            if (buffer.length > 8192) { buffer = ''; this.state('invalid', 'ข้อมูล serial ยาวเกินกำหนด'); }
                            for (const line of lines) {
                                if (this.generation !== generation) return;
                                const start = line.indexOf('{'), end = line.lastIndexOf('}');
                                if (start < 0 || end <= start) continue; // boot/debug log
                                try {
                                    const packet = normalizePacket(JSON.parse(line.slice(start, end + 1)));
                                    if (this.pendingZero) {
                                        if (packet.calibration_id === this.pendingZero.id && packet.boot_id === this.pendingZero.boot) continue;
                                        this.pendingZero = null;
                                    }
                                    this.lastPacket = packet;
                                    this.lastReceived = Date.now();
                                    failures = 0;
                                    this.state('ready', 'รับข้อมูล ESP32 v1 ที่ตั้งศูนย์แล้ว');
                                    this.onPacket(packet);
                                } catch (error) { this.state('invalid', error.message); }
                            }
                        }
                    } catch (error) {
                        if (++failures > 3) throw error;
                        buffer = '';
                        this.state('waiting', 'กำลังรอ serial stream กลับมาพร้อม');
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } finally {
                        reader.releaseLock();
                        if (this.generation === generation) this.reader = null;
                    }
                }
            } catch (error) {
                if (this.generation === generation) this.state('invalid', error.message);
            } finally {
                if (this.generation === generation) {
                    this.connected = false;
                    this.cleanup();
                    try { await this.port.close(); } catch {}
                    this.port = null;
                    this.state('disconnected', 'USB หยุดส่งข้อมูล กดเชื่อมต่อเพื่อเริ่มใหม่');
                }
            }
        }
        cleanup() {
            clearInterval(this.timer);
            if (typeof navigator !== 'undefined' && navigator.serial && this.disconnectListener) navigator.serial.removeEventListener('disconnect', this.disconnectListener);
        }
        async disconnect() {
            ++this.generation;
            this.connected = false;
            this.cleanup();
            if (this.reader) { try { await this.reader.cancel(); } catch {} }
            if (this.running) await this.running;
            this.reader = null;
            if (this.port) { try { await this.port.close(); } catch {} }
            this.port = null;
            this.pendingZero = null;
            this.state('disconnected', 'USB ไม่ได้เชื่อมต่อ');
        }
        async zero() {
            if (!this.connected || !this.port.writable || !this.lastPacket) throw new Error('เชื่อมต่อและรอข้อมูลเซ็นเซอร์ก่อนตั้งศูนย์');
            this.pendingZero = { id: this.lastPacket.calibration_id, boot: this.lastPacket.boot_id, started: Date.now() };
            this.state('calibrating', 'ส่งคำสั่งตั้งศูนย์ รอ ESP32 ยืนยัน');
            const writer = this.port.writable.getWriter();
            try { await writer.write(new TextEncoder().encode('z\n')); }
            catch (error) { this.pendingZero = null; this.state('invalid', error.message); throw error; }
            finally { writer.releaseLock(); }
        }
    }
    scope.C7Device = { calculateCVA, normalizePacket, SerialConnection };
})(typeof window !== 'undefined' ? window : globalThis);
