"""Local serial monitor: no AI calls, no flashing, no automatic calibration."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / '.local' / 'hardware-monitor'
sys.path.insert(0, str(ROOT / '.local' / 'hardware-tools'))


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')
    for attempt in range(4):
        try:
            os.replace(temporary, path)
            return True
        except PermissionError:
            time.sleep(0.03)
    return False


class MonitorState:
    def __init__(self):
        self.connected = False
        self.port = None
        self.error = None
        self.packet = None
        self.received = 0
        self.valid_received = 0
        self.last_frame_at = None
        self.last_frame_time = None
        self.addresses = None
        self.scan_addresses = None
        self.scan_at = None
        self.boot_id = None
        self.calibration = None

    def connect(self, port):
        self.connected = True
        self.port = port
        self.error = None
        self.packet = None
        self.last_frame_time = None
        self.last_frame_at = None
        self.addresses = None
        self.scan_addresses = None
        self.scan_at = None

    def line(self, text, now):
        if text == 'I2C FULL_SCAN_BEGIN':
            self.scan_addresses = set()
        elif text == 'I2C FULL_SCAN_END' and self.scan_addresses is not None:
            self.addresses = sorted(self.scan_addresses)
            self.scan_addresses = None
            self.scan_at = utc_now()
        elif self.scan_addresses is not None:
            for match in re.finditer(r'I2C 0x([0-9A-Fa-f]{2}): ACK\b', text):
                self.scan_addresses.add('0x' + match[1].upper())

        start, end = text.find('{'), text.rfind('}')
        if start < 0 or end <= start:
            return
        try:
            value = json.loads(text[start:end + 1])
        except (ValueError, TypeError):
            return
        if not isinstance(value, dict) or 'protocol_version' not in value:
            return
        self.packet = value
        self.boot_id = value.get('boot_id')
        self.received += 1
        self.last_frame_at = utc_now()
        self.last_frame_time = now
        if self.measurement_valid():
            self.valid_received += 1

    def measurement_valid(self):
        packet = self.packet or {}
        if packet.get('protocol_version') != 1 or packet.get('valid') is not True or packet.get('calibrated') is not True:
            return False
        calibration = packet.get('calibration_id')
        if isinstance(calibration, bool) or not isinstance(calibration, int) or calibration < 1:
            return False
        limits = {'c7_angle': (-15, 35), 'head_pitch': (-25, 45), 'head_roll': (-30, 30), 'head_yaw': (-40, 40), 'cva_angle': (0, 180)}
        for name, (minimum, maximum) in limits.items():
            number = packet.get(name)
            if isinstance(number, bool) or not isinstance(number, (float, int)) or not math.isfinite(number) or not minimum <= number <= maximum:
                return False
        return True

    def snapshot(self, now):
        packet = self.packet or {}
        sensors = packet.get('sensors') if isinstance(packet.get('sensors'), dict) else {}
        age = now - self.last_frame_time if self.last_frame_time is not None else None
        if not self.connected:
            sensors = {}
        elif age is not None and age > 1.2:
            sensors = {key: False if key.endswith('_fresh') else value for key, value in sensors.items()}
        valid = self.connected and age is not None and age <= 1.2 and self.measurement_valid()
        if self.calibration and self.calibration.get('state') == 'sent':
            valid = False
        if not self.connected:
            health = 'DISCONNECTED'
        elif age is None:
            health = 'WAITING_FOR_DATA'
        elif age > 1.2:
            health = 'STALE'
        elif packet.get('protocol_version') != 1:
            health = 'UNSUPPORTED_PROTOCOL'
        elif not valid:
            health = 'SENSOR_NOT_READY'
        elif all(sensors.get(key) is True for key in ['left_present', 'right_present', 'c7_present', 'left_fresh', 'right_fresh', 'c7_fresh']):
            health = 'READY_ALL_3'
        else:
            health = 'PARTIAL_SENSOR_SET'
        return {
            'updated_at': utc_now(), 'pid': os.getpid(), 'connected': self.connected,
            'port': self.port, 'health': health, 'error': self.error,
            'received_packets': self.received, 'valid_packets': self.valid_received,
            'last_frame_at': self.last_frame_at, 'frame_age_seconds': round(age, 2) if age is not None else None,
            'boot_id': packet.get('boot_id'), 'calibration_id': packet.get('calibration_id'),
            'sensors': sensors, 'valid': bool(valid),
            'angles': {key: packet[key] for key in ['c7_angle', 'head_pitch', 'head_roll', 'head_yaw', 'cva_angle']} if valid else None,
            'calibration_supported': True, 'calibration': self.calibration,
            'i2c_addresses': self.addresses, 'last_scan_at': self.scan_at,
            'unexpected_addresses': [address for address in (self.addresses or []) if address not in ['0x4A', '0x4B', '0x68']],
            'note': 'Stop this monitor before using dashboard USB, Serial Monitor or firmware upload.',
        }


class CalibrationControl:
    """Only explicit, short-lived zero requests; confirm a fresh firmware acknowledgement."""
    def __init__(self, runtime):
        self.request_file = runtime / 'calibrate.request.json'
        self.pending = None

    def step(self, state, connection, now):
        if self.pending:
            p = self.pending
            packet = state.packet or {}
            if connection is None or not state.connected:
                self.finish(state, 'failed', 'DISCONNECTED')
            elif packet.get('boot_id') != p['boot_id']:
                self.finish(state, 'failed', 'BOARD_RESTARTED')
            elif now > p['deadline']:
                self.finish(state, 'failed', 'ACK_TIMEOUT')
            elif packet.get('calibration_id', 0) > p['calibration_id'] and state.measurement_valid() and state.last_frame_time is not None and now-state.last_frame_time <= 1.2:
                self.finish(state, 'confirmed')
        if self.pending or not self.request_file.exists():
            return
        try:
            request = json.loads(self.request_file.read_text(encoding='utf-8'))
            self.request_file.unlink(missing_ok=True)
            request_id = request.get('id', '')
            if not isinstance(request_id, str) or not re.fullmatch(r'[a-f0-9]{32}', request_id):
                return
            state.calibration = {'id': request_id, 'state': 'failed', 'error': 'INVALID_REQUEST'}
            created = request.get('created_at')
            if not isinstance(created, (int, float)) or not 0 <= time.time()-created <= 5:
                state.calibration['error'] = 'REQUEST_EXPIRED'
                return
            snapshot = state.snapshot(now)
            packet = state.packet or {}
            if connection is None or not snapshot['valid']:
                state.calibration['error'] = 'SENSOR_NOT_READY'
                return
            if (request.get('boot_id'), request.get('calibration_id')) != (packet.get('boot_id'), packet.get('calibration_id')):
                state.calibration['error'] = 'SESSION_CHANGED'
                return
            self.pending = {'id': request_id, 'boot_id': packet['boot_id'], 'calibration_id': packet['calibration_id'], 'deadline': now+5}
            state.calibration = {'id': request_id, 'state': 'sent', 'error': None}
            try:
                connection.write(b'z\n')
            except OSError:
                self.finish(state, 'failed', 'WRITE_FAILED')
        except (ValueError, OSError, TypeError):
            # A writer may still be filling this tiny file. Retry until expiry, never
            # drop a newly-created request simply because its JSON is incomplete.
            try:
                if time.time()-self.request_file.stat().st_mtime > 5:
                    self.request_file.unlink(missing_ok=True)
            except OSError:
                pass

    def finish(self, state, result, error=None):
        state.calibration = {'id': self.pending['id'], 'state': result, 'error': error}
        self.pending = None


def run(port_override=None):
    try:
        import serial
        from serial.tools import list_ports
    except ImportError as error:
        raise SystemExit('Install pyserial in .local/hardware-tools first; see docs/HARDWARE_MONITOR.md') from error
    import msvcrt  # This workspace monitor targets Windows.

    RUNTIME.mkdir(parents=True, exist_ok=True)
    lock = (RUNTIME / 'monitor.lock').open('a+b')
    lock.seek(0)
    if not lock.read(1):
        lock.write(b'0')
        lock.flush()
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        raise SystemExit('Another hardware monitor is already running')

    logger = logging.getLogger('c7-monitor')
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(RUNTIME / 'events.log', maxBytes=1024 * 1024, backupCount=2, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    logger.addHandler(handler)
    state = MonitorState()
    calibration_control = CalibrationControl(RUNTIME)
    connection = None
    buffer = b''
    retry_at = scan_due = published_at = 0
    fingerprint = None
    stopped = False
    stop_file = RUNTIME / 'stop.request'
    scan_file = RUNTIME / 'scan.request'
    stop_file.unlink(missing_ok=True)
    try:
        while not stopped:
            now = time.monotonic()
            if stop_file.exists():
                stop_file.unlink(missing_ok=True)
                break
            if connection is None and now >= retry_at:
                try:
                    devices = list(list_ports.comports())
                    candidates = [item.device for item in devices if item.vid == 0x10C4 and item.pid == 0xEA60]
                    port = port_override if port_override in [item.device for item in devices] else None
                    if not port_override and len(candidates) == 1:
                        port = candidates[0]
                    if not port:
                        raise RuntimeError('Board not found' if len(candidates) < 2 else 'Multiple CP210x devices; select -Port explicitly')
                    candidate = serial.Serial(port=None, baudrate=115200, timeout=0.2, write_timeout=1)
                    candidate.port = port
                    candidate.dtr = candidate.rts = False
                    candidate.open()
                    connection = candidate
                    state.connect(port)
                    buffer = b''
                    scan_due = now + 1
                except (serial.SerialException, OSError, RuntimeError) as error:
                    state.connected = False
                    state.error = str(error)
                    retry_at = now + 2
            if connection is not None:
                try:
                    chunk = connection.read(min(connection.in_waiting or 1, 8192))
                    buffer += chunk
                    while b'\n' in buffer:
                        line, buffer = buffer.split(b'\n', 1)
                        if len(line) <= 8192:
                            state.line(line.decode('utf-8', errors='replace').strip(), time.monotonic())
                    if len(buffer) > 8192:
                        buffer = b''
                    if now >= scan_due or scan_file.exists():
                        scan_file.unlink(missing_ok=True)
                        connection.write(b's\n')
                        scan_due = now + 15
                except (serial.SerialException, OSError) as error:
                    state.error = str(error)
                    state.connected = False
                    connection.close()
                    connection = None
                    retry_at = now + 2
            else:
                time.sleep(0.1)

            calibration_control.step(state, connection, time.monotonic())
            if now - published_at >= 1:
                snapshot = state.snapshot(time.monotonic())
                atomic_json(RUNTIME / 'status.json', snapshot)
                # Log transitions only. Packet counts, timestamps and moving angles
                # stay in the overwritten status file, not an ever-growing log.
                next_fingerprint = json.dumps({key: snapshot[key] for key in ['connected', 'health', 'port', 'error', 'sensors', 'i2c_addresses', 'boot_id', 'calibration_id']}, sort_keys=True)
                if next_fingerprint != fingerprint:
                    logger.info(next_fingerprint)
                    fingerprint = next_fingerprint
                published_at = now
    except KeyboardInterrupt:
        pass
    finally:
        if connection is not None:
            connection.close()
        state.connected = False
        result = state.snapshot(time.monotonic())
        result['health'] = 'MONITOR_STOPPED'
        atomic_json(RUNTIME / 'status.json', result)
        logger.info('MONITOR_STOPPED')
        lock.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', help='Optional specific Windows COM port; otherwise auto-detect one CP210x board')
    arguments = parser.parse_args()
    run(arguments.port)
