// Isolated command-queue tests: no serial access and no real runtime mutations.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'c7-zero-')),safe=dir.replaceAll('\\','/').replaceAll("'","\\'");
try{
 const source=(await readFile(new URL('../api/hardware_calibrate.php',import.meta.url),'utf8')).replace('<?php','').replace("dirname(__DIR__) . '/.local/hardware-monitor'",`'${safe}'`);
 const state={updated_at:new Date().toISOString(),calibration_supported:true,connected:true,valid:true,frame_age_seconds:.1,boot_id:10,calibration_id:1};
 const defaults={REMOTE_ADDR:'127.0.0.1',REQUEST_METHOD:'POST',HTTP_X_C7_CONTROL:'calibrate',CONTENT_TYPE:'application/json',HTTP_HOST:'127.0.0.1:8080',HTTP_ORIGIN:'http://127.0.0.1:8080'};
 async function request(overrides={},snapshot=state){
  await writeFile(join(dir,'status.json'),JSON.stringify(snapshot));
  const variables={...defaults,...overrides};
  const setup=Object.entries(variables).map(([k,v])=>`$_SERVER['${k}']='${v}';`).join('');
  const result=spawnSync('php',['-r',setup+source],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');return JSON.parse(result.stdout);
 }
 for(const [override,error] of [[{REQUEST_METHOD:'GET'},'POST_REQUIRED'],[{HTTP_ORIGIN:'http://example.invalid'},'ORIGIN_REJECTED'],[{HTTP_X_C7_CONTROL:''},'INVALID_CONTROL_REQUEST'],[{REMOTE_ADDR:'192.0.2.1'},'LOCAL_ONLY']])assert.equal((await request(override)).error,error);
 assert.equal((await request({}, {...state,valid:false})).error,'SENSOR_NOT_READY');
 assert.equal((await request({}, {...state,calibration_supported:false})).error,'MONITOR_OFFLINE');
 await assert.rejects(access(join(dir,'calibrate.request.json')));
 const result=await request();assert.equal(result.state,'queued');
 const queued=JSON.parse(await readFile(join(dir,'calibrate.request.json'),'utf8'));assert.equal(queued.id,result.id);assert.equal(queued.calibration_id,1);
 assert.equal((await request()).error,'CALIBRATION_PENDING');
 console.log('PASS calibration API local/origin/method checks, readiness gating, single request queue and no premature success');
}finally{await rm(dir,{recursive:true,force:true});}
