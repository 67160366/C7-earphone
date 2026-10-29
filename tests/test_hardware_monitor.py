import importlib.util
import json
from pathlib import Path
import unittest
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('hardware_monitor', ROOT / 'scripts/monitor-esp32.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class HardwareMonitorTests(unittest.TestCase):
    def packet(self, **changes):
        return {'protocol_version': 1, 'boot_id': 10, 'calibration_id': 1,
                'calibrated': True, 'valid': True, 'c7_angle': -9, 'head_pitch': 0,
                'head_roll': 0, 'head_yaw': 0, 'cva_angle': 52.05,
                'sensors': {name: True for name in ['left_present', 'right_present', 'c7_present', 'left_fresh', 'right_fresh', 'c7_fresh']}, **changes}

    def test_ready_stale_disconnect_and_reconnect_clear_measurements(self):
        state = monitor.MonitorState()
        state.connect('TEST_PORT')
        self.assertEqual(state.snapshot(1)['health'], 'WAITING_FOR_DATA')
        state.line(json.dumps(self.packet()), 1)
        self.assertEqual(state.snapshot(1.1)['health'], 'READY_ALL_3')
        stale = state.snapshot(2.3)
        self.assertEqual(stale['health'], 'STALE')
        self.assertIsNone(stale['angles'])
        self.assertFalse(stale['sensors']['left_fresh'])
        state.connected = False
        self.assertIsNone(state.snapshot(2.4)['angles'])
        self.assertEqual(state.snapshot(2.4)['sensors'], {})
        state.connect('NEW_TEST_PORT')
        self.assertIsNone(state.snapshot(3)['angles'])
        self.assertIsNone(state.snapshot(3)['i2c_addresses'])

    def test_invalid_partial_and_nonfinite_never_look_like_full_ready(self):
        state = monitor.MonitorState()
        state.connect('TEST_PORT')
        state.line(json.dumps(self.packet(valid=False, c7_angle=None)), 1)
        self.assertEqual(state.snapshot(1)['health'], 'SENSOR_NOT_READY')
        self.assertEqual(state.valid_received, 0)
        value = self.packet()
        value['sensors']['left_fresh'] = False
        state.line(json.dumps(value), 2)
        self.assertEqual(state.snapshot(2)['health'], 'PARTIAL_SENSOR_SET')
        state.line(json.dumps(self.packet(head_pitch=float('inf'))), 3)
        self.assertFalse(state.snapshot(3)['valid'])
        state.line(json.dumps(self.packet(head_pitch=90)), 4)
        self.assertFalse(state.snapshot(4)['valid'])

    def test_full_scan_commits_only_completed_snapshot_and_preserves_other_addresses(self):
        state = monitor.MonitorState()
        state.line('I2C FULL_SCAN_BEGIN', 0)
        state.line('I2C 0x28: ACK', 0)
        state.line('I2C 0x68: ACK', 0)
        self.assertIsNone(state.addresses)
        state.line('I2C FULL_SCAN_END', 0)
        self.assertEqual(state.addresses, ['0x28', '0x68'])
        self.assertEqual(state.snapshot(0)['unexpected_addresses'], ['0x28'])
        state.line('I2C FULL_SCAN_BEGIN', 1)
        state.line('I2C FULL_SCAN_END', 1)
        self.assertEqual(state.addresses, [])

    def test_atomic_status_file(self):
        target = ROOT / '.local' / 'hardware-monitor-test.json'
        target.parent.mkdir(exist_ok=True)
        try:
            self.assertTrue(monitor.atomic_json(target, {'health': 'TEST'}))
            self.assertEqual(json.loads(target.read_text())['health'], 'TEST')
        finally:
            target.unlink(missing_ok=True)
            target.with_suffix('.tmp').unlink(missing_ok=True)

    def test_explicit_zero_waits_for_fresh_firmware_ack_and_sends_once(self):
        with tempfile.TemporaryDirectory() as directory:
            control = monitor.CalibrationControl(Path(directory))
            state = monitor.MonitorState(); state.connect('TEST_PORT')
            state.line(json.dumps(self.packet()), 1)
            class Serial:
                sent = []
                def write(self, value): self.sent.append(value)
            serial = Serial()
            request = {'id': 'a'*32, 'created_at': time.time(), 'boot_id': 10, 'calibration_id': 1}
            control.request_file.write_text(json.dumps(request))
            control.step(state, serial, 1.1)
            self.assertEqual(serial.sent, [b'z\n'])
            self.assertFalse(state.snapshot(1.1)['valid'])
            state.line(json.dumps(self.packet()), 1.2)
            control.step(state, serial, 1.2)
            self.assertEqual(state.calibration['state'], 'sent')
            state.line(json.dumps(self.packet(calibration_id=2)), 1.4)
            control.step(state, serial, 1.4)
            self.assertEqual(state.calibration['state'], 'confirmed')
            self.assertTrue(state.snapshot(1.4)['valid'])
            self.assertEqual(serial.sent, [b'z\n'])

    def test_zero_rejects_expired_or_changed_sessions(self):
        for changes in [{'created_at': time.time()-10}, {'boot_id': 11}]:
            with tempfile.TemporaryDirectory() as directory:
                control = monitor.CalibrationControl(Path(directory))
                state = monitor.MonitorState(); state.connect('TEST_PORT'); state.line(json.dumps(self.packet()), 1)
                request = {'id': 'b'*32, 'created_at': time.time(), 'boot_id': 10, 'calibration_id': 1, **changes}
                control.request_file.write_text(json.dumps(request))
                control.step(state, object(), 1.1)
                self.assertEqual(state.calibration['state'], 'failed')
                self.assertIsNone(control.pending)

    def test_zero_disconnect_restart_timeout_never_confirm(self):
        for failure in ['disconnect', 'restart', 'timeout']:
            with tempfile.TemporaryDirectory() as directory:
                control = monitor.CalibrationControl(Path(directory))
                state = monitor.MonitorState(); state.connect('TEST_PORT'); state.line(json.dumps(self.packet()), 1)
                class Serial:
                    def write(self, value): pass
                serial = Serial()
                control.request_file.write_text(json.dumps({'id': 'c'*32, 'created_at': time.time(), 'boot_id': 10, 'calibration_id': 1}))
                control.step(state, serial, 1.1)
                if failure == 'disconnect': serial = None
                if failure == 'restart': state.line(json.dumps(self.packet(boot_id=11, calibration_id=2)), 1.2)
                control.step(state, serial, 7 if failure == 'timeout' else 1.3)
                self.assertEqual(state.calibration['state'], 'failed')


if __name__ == '__main__':
    unittest.main()
