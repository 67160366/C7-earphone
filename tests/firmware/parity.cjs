const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
function block(signature){const start=source.indexOf(signature);if(start<0)throw Error(signature);return source.slice(start,source.indexOf('\n        }',start)+10);}
const context=vm.createContext({});vm.runInContext(fs.readFileSync('assets/c7-device.js','utf8'),context);vm.runInContext('const DEG2RAD=Math.PI/180,RAD2DEG=180/Math.PI;'+['class Vec3 {','class Quat {','function computeKinematics('].map(block).join('\n'),context);
let maxError=0,count=0,packets=0;
for(const line of fs.readFileSync('.local/firmware-check/results.txt','utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/)){
 if(line.startsWith('{')){JSON.parse(line);packets++;continue;}
 const [label,c7,p,r,y,firmware]=line.split(' ').map((v,i)=>i?Number(v):v);
 const dashboard=vm.runInContext(`computeKinematics(${c7},${p},${r},${y},0).cvaDeg`,context);
 const error=Math.abs(firmware-dashboard);maxError=Math.max(error,maxError);assert.ok(error<0.0001,`${line} vs ${dashboard}`);count++;
}
console.log(JSON.stringify({cppFixtures:count,validJsonPackets:packets,maxAbsoluteErrorDegrees:maxError}));
