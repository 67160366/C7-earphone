#pragma once
#include <cstdint>
struct WireStub {
void begin(int,int){} void setClock(int){} void setTimeOut(int){}
void beginTransmission(uint8_t){} int endTransmission(bool=true){return 1;}
void write(int){} void requestFrom(uint8_t,uint8_t,uint8_t){}
int available(){return 0;} int read(){return 0;}
};
inline WireStub Wire;
