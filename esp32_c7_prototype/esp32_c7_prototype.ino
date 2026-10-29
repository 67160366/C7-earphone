#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <SparkFun_BNO080_Arduino_Library.h>
#include <esp_system.h>

// ============================================================================
// C7-BIOSYNC // USB SERIAL DIRECT MODE (AUTO-ZERO & BREADBOARD READY)
// ตั้งศูนย์อัตโนมัติเมื่อเซ็นเซอร์ที่ตรวจพบส่งข้อมูลพร้อม และรายงาน validity ผ่าน protocol v1
// ============================================================================

#define I2C_SDA_PIN       21
#define I2C_SCL_PIN       22
#define HAPTIC_MOTOR_PIN  25
#define BOOT_BUTTON_PIN   0     // ปุ่ม BOOT บนบอร์ด ESP32 (กดเพื่อตั้งศูนย์ 0° ท่านั่งตรง)

#define BNO_LEFT_ADDR     0x4A  // BNO085 ตัวที่ 1 (ขา DI/ADDR ปล่อยว่าง หรือต่อ GND)
#define BNO_RIGHT_ADDR    0x4B  // BNO085 ตัวที่ 2 (ขา DI/ADDR ต่อเข้า 3.3V)
#define MPU6050_C7_ADDR   0x68  // เซ็นเซอร์เสริมที่ C7 (ถ้าเสียบเพิ่ม)

BNO080 *bnoLeft  = nullptr;
BNO080 *bnoRight = nullptr;

bool hasLeftEar  = false;
bool hasRightEar = false;
bool hasC7Mpu    = false;
bool autoZeroDone = false;
bool leftHasSample = false, rightHasSample = false, c7HasSample = false;
unsigned long leftSampleMs = 0, rightSampleMs = 0, c7SampleMs = 0;
const unsigned long SENSOR_STALE_MS = 500;
uint32_t calibrationId = 0;
uint32_t bootId = 0;
bool previousBootPressed = false;
unsigned long lastButtonCalibrationMs = 0;

// ค่ามุมดิบจากเซ็นเซอร์
float pitchL = 0.0f, rollL = 0.0f, yawL = 0.0f;
float pitchR = 0.0f, rollR = 0.0f, yawR = 0.0f;
float rawHeadPitch = 0.0f, rawHeadRoll = 0.0f, rawHeadYaw = 0.0f;
float rawC7Angle   = 0.0f;

// ค่า Offset สำหรับตั้งศูนย์ (Zero Calibration)
float offsetPitch = 0.0f, offsetRoll = 0.0f, offsetYaw = 0.0f, offsetC7 = 0.0f;

// ค่ามุมสุทธิที่ส่งออกทางสาย USB
float headPitch = 0.0f, headRoll = 0.0f, headYaw = 0.0f;
float c7Angle   = -9.0f;
float cvaAngle  = 52.05f;

unsigned long lastSendMs = 0;
const unsigned long SEND_INTERVAL_MS = 200; // ส่งข้อมูลผ่านสาย USB ทุก 200 ms (5 Hz)

float wrapDeg(float d) {
  if (!isfinite(d)) return 0.0f;
  while (d > 180.0f) d -= 360.0f;
  while (d < -180.0f) d += 360.0f;
  return d;
}

float clampDeg(float v, float minV, float maxV) {
  if (v < minV) return minV;
  if (v > maxV) return maxV;
  return v;
}

// A wrap-aware midpoint keeps +179 and -179 near 180 instead of jumping to zero.
float circularMidpointDeg(float a, float b) {
  return wrapDeg(a + wrapDeg(b - a) * 0.5f);
}

bool sampleIsFresh(bool hasSample, unsigned long sampleMs, unsigned long nowMs) {
  return hasSample && (unsigned long)(nowMs - sampleMs) <= SENSOR_STALE_MS;
}

bool sensorsReady(unsigned long nowMs) {
  const bool headPresent = hasLeftEar || hasRightEar;
  return headPresent
    && (!hasLeftEar || sampleIsFresh(leftHasSample, leftSampleMs, nowMs))
    && (!hasRightEar || sampleIsFresh(rightHasSample, rightSampleMs, nowMs))
    && (!hasC7Mpu || sampleIsFresh(c7HasSample, c7SampleMs, nowMs));
}

bool isI2CDevicePresent(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

// Debug lines intentionally are not JSON measurement packets.
void printI2CStatus() {
  Serial.println(isI2CDevicePresent(BNO_LEFT_ADDR) ? "I2C 0x4A: ACK" : "I2C 0x4A: NO_ACK");
  Serial.println(isI2CDevicePresent(BNO_RIGHT_ADDR) ? "I2C 0x4B: ACK" : "I2C 0x4B: NO_ACK");
  Serial.println(isI2CDevicePresent(MPU6050_C7_ADDR) ? "I2C 0x68: ACK" : "I2C 0x68: NO_ACK");
}

void scanI2CBus() {
  const char hexDigits[] = "0123456789ABCDEF";
  Serial.println("I2C FULL_SCAN_BEGIN");
  // Probe all non-reserved 7-bit addresses, without writing device registers.
  for (uint8_t address = 0x08; address <= 0x77; address++) {
    if (isI2CDevicePresent(address)) {
      char message[] = "I2C 0x00: ACK";
      message[6] = hexDigits[address >> 4];
      message[7] = hexDigits[address & 0x0F];
      Serial.println(message);
    }
    delay(1);
  }
  Serial.println("I2C FULL_SCAN_END");
}

bool beginBno(BNO080 *sensor, uint8_t address) {
  for (int attempt = 0; attempt < 2; attempt++) {
    if (!isI2CDevicePresent(address)) return false;
    // begin() initializes the instance transport, but its immediate product-ID
    // read can miss the asynchronous response. Confirm an actual quaternion
    // report instead of trusting an ACK or treating that timing miss as absence.
    sensor->begin(address, Wire);
    sensor->enableARVRStabilizedRotationVector(50);
    const unsigned long started = millis();
    while ((unsigned long)(millis() - started) < 2500) {
      if (sensor->getReadings() == SENSOR_REPORTID_AR_VR_STABILIZED_ROTATION_VECTOR) {
        const float qw = sensor->getQuatReal(), qx = sensor->getQuatI();
        const float qy = sensor->getQuatJ(), qz = sensor->getQuatK();
        const float norm = qw * qw + qx * qx + qy * qy + qz * qz;
        if (isfinite(norm) && norm > 0.8f && norm < 1.2f) {
          sensor->hasReset(); // Consume the boot reset already handled above.
          return true;
        }
      }
      delay(10);
    }
    delay(150);
  }
  return false;
}

void enableBnoReports(BNO080 *bno) {
  if (!bno) return;
  bno->enableARVRStabilizedRotationVector(50); // 20 Hz (50ms) ไม่ให้กวนบัส I2C บน Breadboard
}

// แปลง Quaternion เป็นมุม Pitch (ก้ม/เงย), Roll (เอียงซ้าย/ขวา), Yaw (หันซ้าย/ขวา) ที่ถูกต้อง
void quaternionToEulerDeg(float qw, float qx, float qy, float qz, float &pitch, float &roll, float &yaw) {
  // Pitch (แกนก้ม/เงย)
  float sinp = 2.0f * (qw * qx + qy * qz);
  float cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
  pitch = atan2f(sinp, cosp) * (180.0f / PI);

  // Roll (แกนเอียงคอซ้าย/ขวา)
  float sinr = 2.0f * (qw * qy - qz * qx);
  roll = (fabs(sinr) >= 1.0f) ? copysignf(90.0f, sinr) : asinf(sinr) * (180.0f / PI);

  // Yaw (แกนหันหน้าซ้าย/ขวา)
  float siny = 2.0f * (qw * qz + qx * qy);
  float cosy = 1.0f - 2.0f * (qy * qy + qz * qz);
  yaw = atan2f(siny, cosy) * (180.0f / PI);
}

bool initMpu6050AtC7() {
  if (!isI2CDevicePresent(MPU6050_C7_ADDR)) return false;
  Wire.beginTransmission(MPU6050_C7_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  return (Wire.endTransmission() == 0);
}

int16_t readInt16BE() {
  const uint8_t highByte = (uint8_t)Wire.read();
  const uint8_t lowByte = (uint8_t)Wire.read();
  return (int16_t)(((uint16_t)highByte << 8) | lowByte);
}

// อ่านมุมก้มเงยจาก MPU6050 โดยรองรับการวางนอนราบบน Breadboard (เทียบแกน X กับ Z)
bool readC7PitchFromMpu6050(float &angle) {
  Wire.beginTransmission(MPU6050_C7_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;

  Wire.requestFrom((uint8_t)MPU6050_C7_ADDR, (uint8_t)6, (uint8_t)true);
  if (Wire.available() < 6) return false;

  const int16_t ax = readInt16BE();
  const int16_t ay = readInt16BE();
  const int16_t az = readInt16BE();

  // ใช้ atan2(ax, az) เพื่อให้ตอนวางบอร์ดนอนราบบนโต๊ะมีค่ามุมใกล้ 0° (ไม่พุ่งไป +81°)
  if (ax == 0 && ay == 0 && az == 0) return false;
  angle = atan2f((float)ax, (float)az) * (180.0f / PI);
  return isfinite(angle);
}

// SparkFun keeps transport/quaternion state per instance for the two I2C addresses.
// Same Euler quaternion and vector rotation as dashboard Quat.fromEulerDeg.
// Mid-ear offset is the average of the two ear offsets: (0, 0.12, 0.2505).
void rotateEulerYZ(float pitch, float yaw, float roll,
                   float vx, float vy, float vz, float &outY, float &outZ) {
  const float rx = pitch * (PI / 360.0f);
  const float ry = yaw * (PI / 360.0f);
  const float rz = roll * (PI / 360.0f);
  const float cx = cosf(rx), sx = sinf(rx);
  const float cy = cosf(ry), sy = sinf(ry);
  const float cz = cosf(rz), sz = sinf(rz);
  float qw = cy * cx * cz + sy * sx * sz;
  float qx = cy * sx * cz + sy * cx * sz;
  float qy = sy * cx * cz - cy * sx * sz;
  float qz = cy * cx * sz - sy * sx * cz;
  const float length = sqrtf(qw * qw + qx * qx + qy * qy + qz * qz);
  qw /= length; qx /= length; qy /= length; qz /= length;
  const float uvx = qy * vz - qz * vy;
  const float uvy = qz * vx - qx * vz;
  const float uvz = qx * vy - qy * vx;
  outY = vy + 2.0f * qw * uvy + 2.0f * (qz * uvx - qx * uvz);
  outZ = vz + 2.0f * qw * uvz + 2.0f * (qx * uvy - qy * uvx);
}

float calculateCVA(float c7Deg, float headPitchDeg, float headRollDeg, float headYawDeg) {
  const float neckTilt = 4.2f + c7Deg * 1.02f + max(0.0f, headPitchDeg * 0.16f);
  float neckY, neckZ, earY, earZ;
  rotateEulerYZ(neckTilt, headYawDeg * 0.35f, headRollDeg * 0.4f,
                0.0f, 0.985f, 0.0f, neckY, neckZ);
  rotateEulerYZ(headPitchDeg, headYawDeg, headRollDeg,
                0.0f, 0.12f, 0.2505f, earY, earZ);
  return atan2f(0.04f + neckY + earY, max(0.15f, 0.725f + neckZ + earZ)) * (180.0f / PI);
}

void calibrateNeutralPosture() {
  offsetPitch = rawHeadPitch;
  offsetRoll  = rawHeadRoll;
  offsetYaw   = rawHeadYaw;
  offsetC7    = rawC7Angle;
  autoZeroDone = true;
  calibrationId++;
}

void setup() {
  WiFi.mode(WIFI_OFF);
  btStop();

  bootId = esp_random();
  Serial.begin(115200);
  delay(800);

  Serial.println("\n============================================");
  Serial.println("🚀 C7-BIOSYNC (AUTO-ZERO CALIBRATED MODE)");
  Serial.println("============================================");

  pinMode(HAPTIC_MOTOR_PIN, OUTPUT);
  digitalWrite(HAPTIC_MOTOR_PIN, LOW);
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(25); // ป้องกันบอร์ดค้างกรณีสายจัมเปอร์บน Breadboard ขยับหลวม
  delay(150);

  if (isI2CDevicePresent(BNO_LEFT_ADDR)) {
    bnoLeft = new BNO080();
    if (beginBno(bnoLeft, BNO_LEFT_ADDR)) {
      hasLeftEar = true;
      enableBnoReports(bnoLeft);
      Serial.println("✅ [OK] BNO085 Left Ear (0x4A) Connected!");
    }
  }

  if (isI2CDevicePresent(BNO_RIGHT_ADDR)) {
    bnoRight = new BNO080();
    if (beginBno(bnoRight, BNO_RIGHT_ADDR)) {
      hasRightEar = true;
      enableBnoReports(bnoRight);
      Serial.println("✅ [OK] BNO085 Right Ear (0x4B) Connected!");
    }
  }

  hasC7Mpu = initMpu6050AtC7();
  if (hasC7Mpu) {
    Serial.println("✅ [OK] MPU6050 at C7 (0x68) Connected!");
  }
  printI2CStatus();
}

void loop() {


  if (hasLeftEar && bnoLeft) {
    if (bnoLeft->hasReset()) {
      enableBnoReports(bnoLeft);
      leftHasSample = false;
      autoZeroDone = false;
    }
    if (bnoLeft->getReadings() == SENSOR_REPORTID_AR_VR_STABILIZED_ROTATION_VECTOR) {
      quaternionToEulerDeg(bnoLeft->getQuatReal(), bnoLeft->getQuatI(),
                           bnoLeft->getQuatJ(), bnoLeft->getQuatK(),
                           pitchL, rollL, yawL);
      leftHasSample = isfinite(pitchL) && isfinite(rollL) && isfinite(yawL);
      if (leftHasSample) leftSampleMs = millis();
    }
  }

  if (hasRightEar && bnoRight) {
    if (bnoRight->hasReset()) {
      enableBnoReports(bnoRight);
      rightHasSample = false;
      autoZeroDone = false;
    }
    if (bnoRight->getReadings() == SENSOR_REPORTID_AR_VR_STABILIZED_ROTATION_VECTOR) {
      quaternionToEulerDeg(bnoRight->getQuatReal(), bnoRight->getQuatI(),
                           bnoRight->getQuatJ(), bnoRight->getQuatK(),
                           pitchR, rollR, yawR);
      rightHasSample = isfinite(pitchR) && isfinite(rollR) && isfinite(yawR);
      if (rightHasSample) rightSampleMs = millis();
    }
  }

  if (hasLeftEar && hasRightEar) {
    rawHeadPitch = circularMidpointDeg(pitchL, pitchR);
    rawHeadRoll  = circularMidpointDeg(rollL, rollR);
    rawHeadYaw   = circularMidpointDeg(yawL, yawR);
  } else if (hasLeftEar) {
    rawHeadPitch = pitchL; rawHeadRoll = rollL; rawHeadYaw = yawL;
  } else if (hasRightEar) {
    rawHeadPitch = pitchR; rawHeadRoll = rollR; rawHeadYaw = yawR;
  }

  if (hasC7Mpu) {
    float angle;
    if (readC7PitchFromMpu6050(angle)) {
      rawC7Angle = angle;
      c7HasSample = true;
      c7SampleMs = millis();
    }
  }

  // Firmware owns calibration. A request invalidates readings until fresh sensors
  // can acknowledge it with an incremented calibration_id. No browser-side tare.
  const bool bootPressed = digitalRead(BOOT_BUTTON_PIN) == LOW;
  if (bootPressed && !previousBootPressed && millis() - lastButtonCalibrationMs >= 250) {
    autoZeroDone = false;
    lastButtonCalibrationMs = millis();
  }
  previousBootPressed = bootPressed;
  while (Serial.available() > 0) {
    const char cmd = (char)Serial.read();
    if (cmd == 'z' || cmd == 'Z' || cmd == 'c' || cmd == 'C') autoZeroDone = false;
    if (cmd == 'i' || cmd == 'I') printI2CStatus();
    if (cmd == 's' || cmd == 'S') scanI2CBus();
  }
  const unsigned long nowMs = millis();
  const bool ready = sensorsReady(nowMs);
  if (!autoZeroDone && ready && nowMs > 1500) calibrateNeutralPosture();
  const bool valid = autoZeroDone && ready;

  // คำนวณมุมสัมพัทธ์จากจุดตั้งศูนย์ และจำกัดขอบเขตสรีระจริง
  headPitch = clampDeg(wrapDeg(rawHeadPitch - offsetPitch), -25.0f, 45.0f);
  headRoll  = clampDeg(wrapDeg(rawHeadRoll  - offsetRoll),  -30.0f, 30.0f);
  headYaw   = clampDeg(wrapDeg(rawHeadYaw   - offsetYaw),   -40.0f, 40.0f);

  if (hasC7Mpu) {
    float deltaC7 = wrapDeg(rawC7Angle - offsetC7);
    c7Angle = clampDeg(-9.0f + deltaC7 + (headPitch * 0.35f), -15.0f, 35.0f);
  } else {
    c7Angle = clampDeg(-9.0f + (headPitch * 0.65f), -15.0f, 35.0f);
  }

  cvaAngle = calculateCVA(c7Angle, headPitch, headRoll, headYaw);

  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();

    String jsonPayload;
    jsonPayload.reserve(440);
    jsonPayload = "{\"protocol_version\":1,";
    jsonPayload += "\"boot_id\":" + String(bootId) + ",";
    jsonPayload += "\"calibration_id\":" + String(calibrationId) + ",";
    jsonPayload += "\"calibrated\":" + String(autoZeroDone ? "true" : "false") + ",";
    jsonPayload += "\"valid\":" + String(valid ? "true" : "false") + ",";
    jsonPayload += "\"c7_estimated\":" + String(hasC7Mpu ? "false" : "true") + ",";
    jsonPayload += "\"sensors\":{\"left_present\":" + String(hasLeftEar ? "true" : "false");
    jsonPayload += ",\"right_present\":" + String(hasRightEar ? "true" : "false");
    jsonPayload += ",\"c7_present\":" + String(hasC7Mpu ? "true" : "false");
    jsonPayload += ",\"left_fresh\":" + String(sampleIsFresh(leftHasSample, leftSampleMs, nowMs) ? "true" : "false");
    jsonPayload += ",\"right_fresh\":" + String(sampleIsFresh(rightHasSample, rightSampleMs, nowMs) ? "true" : "false");
    jsonPayload += ",\"c7_fresh\":" + String(sampleIsFresh(c7HasSample, c7SampleMs, nowMs) ? "true" : "false") + "},";
    jsonPayload += "\"c7_angle\":"   + (valid ? String(c7Angle, 2) : String("null")) + ",";
    jsonPayload += "\"head_pitch\":" + (valid ? String(headPitch, 2) : String("null")) + ",";
    jsonPayload += "\"head_roll\":"  + (valid ? String(headRoll, 2) : String("null")) + ",";
    jsonPayload += "\"head_yaw\":"   + (valid ? String(headYaw, 2) : String("null")) + ",";
    jsonPayload += "\"cva_angle\":"  + (valid ? String(cvaAngle, 2) : String("null"));
    jsonPayload += "}";

    Serial.println(jsonPayload);
  }
}
