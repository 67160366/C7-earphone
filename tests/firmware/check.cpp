#include "../../esp32_c7_prototype/esp32_c7_prototype.ino"
int main(){
 assert(fabsf(fabsf(circularMidpointDeg(179,-179))-180)<0.001f);
 assert(!sampleIsFresh(false,0,0));
 assert(sampleIsFresh(true,0xfffffff0u,5));
 assert(!sensorsReady(2000));
 stubNow=2000; bootId=123456789u; loop();
 assert(Serial.lastJson.find("\"valid\":false")!=std::string::npos);
 assert(Serial.lastJson.find("\"c7_angle\":null")!=std::string::npos);
 std::cout<<Serial.lastJson<<"\n";
 hasLeftEar=true;hasRightEar=true;
 bnoLeft=new BNO080();bnoRight=new BNO080();
 stubNow=2200;loop();
 assert(autoZeroDone&&calibrationId==1);
 assert(Serial.lastJson.find("\"valid\":true")!=std::string::npos);
 std::cout<<Serial.lastJson<<"\n";
 // Independent sensor instances must retain distinct quaternion samples.
 bnoLeft->individualPitch=12;bnoRight->individualPitch=-6;
 stubNow=2250;loop();
 assert(fabsf(pitchL-12)<0.001f&&fabsf(pitchR+6)<0.001f);
 assert(fabsf(rawHeadPitch-3)<0.001f);
 bnoLeft->individualPitch=NAN;bnoRight->individualPitch=NAN;
 stubEmit=false;stubNow=2800;loop();
 assert(Serial.lastJson.find("\"valid\":false")!=std::string::npos);
 stubEmit=true;stubPitch=10;stubNow=3000;Serial.input="z";loop();
 assert(calibrationId==2&&fabsf(headPitch)<0.001f);
 assert(Serial.lastJson.find("\"calibration_id\":2")!=std::string::npos);
 std::cout<<Serial.lastJson<<"\n";
 // Never auto-zero from one detected sensor while the other has no sample.
 autoZeroDone=false;rightHasSample=false;stubEmit=false;stubNow=3200;loop();
 assert(!autoZeroDone&&calibrationId==2);
 // A sensor reset invalidates the old orientation origin until recalibrated.
 stubEmit=true;bnoLeft->reset=true;stubNow=3400;loop();
 assert(autoZeroDone&&calibrationId==3);
 for(float c7=-15;c7<=35;c7+=10)
 for(float p=-25;p<=45;p+=10)
 for(float r=-30;r<=30;r+=15)
 for(float y=-40;y<=40;y+=20)
  std::cout<<"CVA "<<c7<<" "<<p<<" "<<r<<" "<<y<<" "<<std::setprecision(9)<<calculateCVA(c7,p,r,y)<<"\n";
}
