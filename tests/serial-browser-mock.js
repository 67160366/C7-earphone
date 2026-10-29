// Injected only into disposable copies by scripts/prepare-browser-check.ps1.
// This tests the actual page handlers without requesting a physical serial port.
(function () {
    let controller, timer, mode = 'neutral', calibration = 1;
    const port = {
        readable: null, writable: null,
        async open() {
            this.readable = new ReadableStream({ start(value) { controller = value; } });
            this.writable = new WritableStream({ write(bytes) {
                if (new TextDecoder().decode(bytes).includes('z')) { calibration++; mode = 'neutral'; }
            } });
            timer = setInterval(() => {
                if (mode === 'pause') return;
                const angles = mode === 'angled' ? [-2.5, 10, 12, 20] : [-9, 0, 0, 0];
                const packet = { protocol_version: 1, boot_id: 555, calibration_id: calibration, calibrated: true, valid: mode !== 'invalid',
                    c7_angle: angles[0], head_pitch: angles[1], head_roll: angles[2], head_yaw: angles[3],
                    cva_angle: Number(C7Device.calculateCVA(...angles).toFixed(2)) };
                if (!packet.valid) for (const key of ['c7_angle', 'head_pitch', 'head_roll', 'head_yaw', 'cva_angle']) packet[key] = null;
                controller.enqueue(new TextEncoder().encode(JSON.stringify(packet) + '\n'));
            }, 200);
        },
        async setSignals() {},
        async close() { clearInterval(timer); this.readable = null; this.writable = null; }
    };
    const serial = new EventTarget();
    serial.requestPort = async () => port;
    serial.getPorts = async () => [];
    Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });
    addEventListener('DOMContentLoaded', () => {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;padding:8px;background:#fafafa;color:#111';
        panel.textContent = 'TEST FIXTURE — mock USB, isolated data: ';
        for (const name of ['neutral', 'angled', 'invalid', 'pause']) {
            const button = document.createElement('button');
            button.textContent = 'Test: ' + name;
            button.onclick = () => { mode = name; };
            panel.append(button);
        }
        document.body.append(panel);
    });
})();
