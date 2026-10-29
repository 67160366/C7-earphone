#pragma once
#include <cmath>
#include <algorithm>
#include <string>
#include <sstream>
#include <iomanip>
#include <cstdint>
#include <iostream>
#include <cassert>
using std::max;
using std::isfinite;
#define PI 3.14159265358979323846
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LOW 0
#define HIGH 1
class String: public std::string {
public:
 using std::string::string;
 String():std::string(){}
 String(const std::string&s):std::string(s){}
 String(uint32_t v):std::string(std::to_string(v)){}
 String(float v,int p) {std::ostringstream os;os<<std::fixed<<std::setprecision(p)<<v;assign(os.str());}
};
inline String operator+(const char*a,const String&b){return String(std::string(a)+std::string(b));}
inline String operator+(const String&a,const char*b){return String(std::string(a)+std::string(b));}
inline uint32_t stubNow=0;
inline unsigned long millis(){return stubNow;}
inline void delay(int ms){stubNow+=ms;}
inline void pinMode(int,int){}
inline void digitalWrite(int,int){}
inline int stubBoot=HIGH;
inline int digitalRead(int){return stubBoot;}
inline void btStop(){}
struct SerialStub {
 std::string input, lastJson;
 void begin(int){}
 void println(const char*msg){lastJson=msg;}
 void println(const String&msg){lastJson=msg;}
 int available(){return input.size();}
 int read(){char c=input.front();input.erase(0,1);return c;}
};
inline SerialStub Serial;
