// Isolated monitor fixtures: never replace the live watcher's snapshot or open serial.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'c7-demo-'));
try {
    const path=join(dir,'status.json').replaceAll('\\','/');
    const php=(await readFile(new URL('../api/hardware_status.php',import.meta.url),'utf8'))
        .replace('<?php','').replace("dirname(__DIR__) . '/.local/hardware-monitor/status.json'", "'"+path.replaceAll("'","\\'")+"'");
    const state={updated_at:new Date().toISOString(),connected:true,valid:true,health:'PARTIAL_SENSOR_SET',frame_age_seconds:0.2,
        boot_id:'private-test-id',calibration_id:1,sensors:{left_fresh:true,right_fresh:false,c7_fresh:true},angles:{head_pitch:10,head_roll:12,head_yaw:20,c7_angle:-2,cva_angle:46}};
    async function check(value,remote='127.0.0.1'){
        await writeFile(path,JSON.stringify(value));
        const result=spawnSync('php',['-r',`$_SERVER['REMOTE_ADDR']='${remote}';`+php],{encoding:'utf8',windowsHide:true});
        assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');return JSON.parse(result.stdout);
    }
    const valid=await check(state);assert.equal(valid.valid,true);assert.deepEqual(valid.angles,state.angles);assert.equal('boot_id' in valid,false);
    for(const change of [{connected:false},{valid:false},{frame_age_seconds:2},{sensors:{left_fresh:false,right_fresh:false}},{updated_at:new Date(Date.now()-10000).toISOString()},{angles:{...state.angles,head_pitch:null}}]){
        const result=await check({...state,...change});assert.equal(result.valid,false);assert.equal(result.angles,null);
    }
    assert.equal((await check(state,'192.0.2.1')).health,'LOCAL_ONLY');
    assert.notEqual((await check({...state,calibration_id:2})).session,valid.session);
    const source=await readFile(new URL('../assets/demo-posture.js',import.meta.url),'utf8');
    const {PostureTracker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const tracker=new PostureTracker(),sample=(stamp,cva=46,session='a')=>({valid:true,session,updated_at:String(stamp),angles:{cva_angle:cva}});
    assert.equal(tracker.update(sample(0),0).kind,'observing');
    for(let i=1;i<=9;i++)assert.equal(tracker.update(sample(i),i*1000).kind,'observing');
    assert.equal(tracker.update(sample(10),10000).kind,'suspected');
    assert.equal(tracker.update(sample(11,52.05),11000).kind,'reference');
    assert.equal(tracker.update({valid:false},12000).kind,'waiting');
    tracker.update(sample(13),13000);assert.equal(tracker.update(sample(14,46,'b'),14000).seconds,0);
    assert.equal(tracker.update(sample(20,46,'b'),20000).seconds,0);
    const repeated=new PostureTracker();repeated.update(sample(0),0);
    for(let i=1;i<=12;i++)assert.equal(repeated.update(sample(0),i*1000).seconds,0);
    console.log('PASS single-BNO and stale/invalid API, private-field filtering, calibration-session reset and sustained-posture timer');
} finally {await rm(dir,{recursive:true,force:true});}
