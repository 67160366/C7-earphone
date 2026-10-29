#pragma once
#define SENSOR_REPORTID_AR_VR_STABILIZED_ROTATION_VECTOR 0x28
inline bool stubEmit = true;
inline float stubPitch = 0;
struct BNO080 {
  bool reset = false;
  float samplePitch = 0;
  float individualPitch = NAN;
  bool begin(int, WireStub&) { return true; }
  void enableARVRStabilizedRotationVector(int) {}
  bool hasReset() { bool result = reset; reset = false; return result; }
  int getReadings() {
    if (!stubEmit) return 0;
    samplePitch = isfinite(individualPitch) ? individualPitch : stubPitch;
    return SENSOR_REPORTID_AR_VR_STABILIZED_ROTATION_VECTOR;
  }
  float getQuatReal() { return cosf(samplePitch * PI / 360.0f); }
  float getQuatI() { return sinf(samplePitch * PI / 360.0f); }
  float getQuatJ() { return 0; }
  float getQuatK() { return 0; }
};
