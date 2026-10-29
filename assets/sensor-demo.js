import * as THREE from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { PostureTracker } from './demo-posture.js';

const el=id=>document.getElementById(id),tracker=new PostureTracker();
let state={valid:false,sensors:{}},lastResponse=0,pose={head_pitch:0,head_roll:0,head_yaw:0},labelsVisible=true,c7Visible=true,lastModelCva=52.05,hasModelSample=false;
const sensorVisible={left:true,right:true,c7:true},sensorNames={left:'BNO ซ้าย',right:'BNO ขวา',c7:'MPU'};
let zeroBusy=false,zeroId=null,zeroDeadline=0;
const zeroErrors={SENSOR_NOT_READY:'เซ็นเซอร์ยังไม่พร้อม กรุณารอข้อมูลสด',MONITOR_OFFLINE:'มอนิเตอร์ยังไม่รองรับหรือหยุดทำงาน',ACK_TIMEOUT:'ESP ยังไม่ยืนยัน กรุณาตรวจบอร์ดแล้วลองใหม่',DISCONNECTED:'บอร์ดหลุดระหว่างตั้งศูนย์',BOARD_RESTARTED:'บอร์ดเริ่มใหม่ กรุณารอแล้วตั้งศูนย์อีกครั้ง',SESSION_CHANGED:'ท่าอ้างอิงเปลี่ยนระหว่างรอ กรุณาลองใหม่',CALIBRATION_PENDING:'มีคำขอตั้งศูนย์อยู่ กรุณารอ',REQUEST_EXPIRED:'คำขอหมดอายุ กรุณาลองใหม่'};
function zeroFinish(success,message){zeroBusy=false;zeroId=null;el('zero-status').textContent=message;el('zero-status').dataset.tone=success?'success':'error';el('calibrate').textContent='◎ ตั้งศูนย์ท่านี้';}
el('calibrate').onclick=async()=>{
    if(zeroBusy||!state.valid||!state.calibration_supported)return;
    zeroBusy=true;el('calibrate').disabled=true;el('zero-status').dataset.tone='pending';
    try{
        for(let n=3;n>0;n--){el('zero-status').textContent=`อยู่นิ่ง · จะตั้งศูนย์ใน ${n} วินาที`;el('calibrate').textContent=`กำลังเตรียม ${n}…`;await new Promise(resolve=>setTimeout(resolve,1000));}
        if(!state.valid||!state.calibration_supported)throw Error('SENSOR_NOT_READY');
        el('zero-status').textContent='ส่งคำสั่งแล้ว กำลังรอ ESP ยืนยัน…';el('calibrate').textContent='กำลังตั้งศูนย์…';
        const r=await fetch('/api/hardware_calibrate.php',{method:'POST',headers:{'Content-Type':'application/json','X-C7-Control':'calibrate'},body:'{}',signal:AbortSignal.timeout(3000)});
        const result=await r.json();if(!r.ok)throw Error(result.error||'REQUEST_FAILED');zeroId=result.id;zeroDeadline=performance.now()+8000;
    }catch(error){zeroFinish(false,zeroErrors[error.message]||'ส่งคำสั่งไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่');}
};
document.querySelectorAll('[data-sensor]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.sensor;sensorVisible[id]=!sensorVisible[id];
    button.setAttribute('aria-pressed',String(sensorVisible[id]));button.textContent=sensorNames[id]+' · '+(sensorVisible[id]?'แสดง':'ซ่อน');
    if(!sensorVisible[id])el('label-'+id).style.display='none';
}));
el('toggle-c7').onclick=()=>{
    c7Visible=!c7Visible;el('toggle-c7').setAttribute('aria-pressed',String(c7Visible));
    el('toggle-c7').textContent=c7Visible?'C7 · แสดงอยู่':'C7 · ซ่อนอยู่';
    el('c7-measurement').hidden=!c7Visible;
    if(!c7Visible)el('label-landmark').style.display='none';
};
function measurement(angle,source){
    const a=angle*Math.PI/180,cx=40,cy=155,r=32,x=cx+135*Math.cos(a),y=cy-135*Math.sin(a),ax=cx+r*Math.cos(a),ay=cy-r*Math.sin(a);
    el('measure-line').setAttribute('d',`M${cx} ${cy} L${x} ${y}`);
    el('measure-arc').setAttribute('d',`M${cx+r} ${cy} A${r} ${r} 0 0 0 ${ax} ${ay}`);
    el('measure-sector').setAttribute('d',`M${cx} ${cy} L${cx+r} ${cy} A${r} ${r} 0 0 0 ${ax} ${ay} Z`);
    el('measure-ear').setAttribute('cx',x);el('measure-ear').setAttribute('cy',y);
    el('measure-ear-text').setAttribute('x',x+9);el('measure-ear-text').setAttribute('y',y-8);
    el('measure-degrees').textContent='≈ '+angle.toFixed(1)+'°';el('measure-source').textContent=source;
}
const healthText={DISCONNECTED:'ยังไม่พบบอร์ด',MONITOR_OFFLINE:'มอนิเตอร์ไม่ได้ทำงาน',SENSOR_NOT_READY:'รอเซ็นเซอร์พร้อม',STALE:'ข้อมูลขาดช่วง',WAITING_FOR_DATA:'รอข้อมูลจากบอร์ด'};
function display(s){
    state=s;const live=s.valid===true,sensors=s.sensors||{};
    if(zeroId){
        const ack=s.calibration;
        if(ack?.id===zeroId&&ack.state==='confirmed')zeroFinish(true,'ตั้งศูนย์สำเร็จ · ESP ยืนยันท่าเริ่มต้นแล้ว '+new Date().toLocaleTimeString('th-TH'));
        else if(ack?.id===zeroId&&ack.state==='failed')zeroFinish(false,zeroErrors[ack.error]||'ตั้งศูนย์ไม่สำเร็จ กรุณาลองใหม่');
        else if(performance.now()>zeroDeadline)zeroFinish(false,'ยังไม่ได้รับการยืนยันจาก ESP กรุณาตรวจบอร์ดแล้วลองใหม่');
    }
    el('calibrate').disabled=zeroBusy||!live||s.calibration_supported!==true;
    if(!zeroBusy&&!el('zero-status').dataset.tone)el('zero-status').textContent=live&&s.calibration_supported?'พร้อมตั้งศูนย์ · นับถอยหลัง 3 วินาทีหลังจากกด':'รอเซ็นเซอร์และมอนิเตอร์พร้อมก่อนตั้งศูนย์';
    if(live){pose=s.angles;lastModelCva=s.angles.cva_angle;hasModelSample=true;}
    measurement(lastModelCva,live?'CVA ประมาณจากข้อมูลเซ็นเซอร์':hasModelSample?'ข้อมูลเก่า · ภาพค้าง รอข้อมูลสด':'ท่าอ้างอิง · ไม่ใช่ค่าปัจจุบัน');
    const count=Number(sensors.left_fresh===true)+Number(sensors.right_fresh===true);
    el('source').className='pill'+(live?' live':'');el('source').textContent=live?'● LIVE · BNO '+count+' ตัว':'○ รอข้อมูลจริง';
    el('connection').textContent=live?'เชื่อมต่อแล้ว · '+new Date(s.updated_at).toLocaleTimeString('th-TH'):(healthText[s.health]||'รอเชื่อมต่อ');
    el('overlay').textContent=live?'ข้อมูลจริง · ลำตัวเป็นฐานอ้างอิงคงที่':'ไม่มีข้อมูลสด · ภาพหยุดรอ';
    let active=0;
    for(const [id,key] of [['left','left_fresh'],['right','right_fresh'],['c7','c7_fresh']]){
        const fresh=sensors[key]===true;active+=Number(fresh);
        el(id).classList.toggle('fresh',fresh);el(id).querySelector('span').textContent=fresh?'ข้อมูลสด':'ไม่พร้อม';
        el('label-'+id).classList.toggle('fresh',fresh);
    }
    el('sensor-count').textContent=active+' / 3';
    for(const key of ['pitch','roll','yaw']){
        const v=live?s.angles['head_'+key]:null;el(key).textContent=v===null?'—':v.toFixed(1)+'°';
        const f=v===null?0:Math.max(-50,Math.min(50,v/45*50));el(key+'-bar').style.left=(50+Math.min(0,f))+'%';el(key+'-bar').style.width=Math.abs(f)+'%';
    }
    el('angle-label').textContent=live?'Pitch '+s.angles.head_pitch.toFixed(1)+'°':'Pitch —';
    el('cva').textContent=live?s.angles.cva_angle.toFixed(1)+'°':'—';
    const result=tracker.update(s,performance.now()),messages={
        waiting:['○','รอประเมินท่าทาง','ต้องมีข้อมูลสดจาก BNO ก่อนเริ่มประเมิน','waiting'],
        reference:['✓','ยังไม่เข้าเกณฑ์คอยื่น','ค่าประมาณยังไม่ลดเกินเกณฑ์เดโม ไม่ได้ยืนยันว่าไม่มีคอยื่น','reference'],
        observing:['◷','แนวโน้มคอยื่น','ค่าประมาณลดจากท่าศูนย์ ≥ 5° กำลังจับเวลาต่อเนื่อง','warning'],
        suspected:['!','สงสัยคอยื่น · ค่าประมาณ','เข้าเกณฑ์เดโมต่อเนื่อง 10 วินาที ลองกลับท่าอ้างอิง','warning']
    };
    const m=messages[result.kind];el('posture-icon').textContent=m[0];el('posture-title').textContent=m[1];el('posture-detail').textContent=m[2];el('assessment').dataset.tone=m[3];
    el('hold-progress').style.width=(result.seconds*10)+'%';el('hold-detail').textContent=result.kind==='observing'||result.kind==='suspected'?`ค้าง ${result.seconds.toFixed(1)} / 10 วินาที · เกณฑ์เดโม`:'เกณฑ์เดโม: ลดจากท่าศูนย์ ≥ 5° ค้าง 10 วินาที';
}
async function poll(){
    try{const r=await fetch('/api/hardware_status.php',{cache:'no-store',signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error('status');const s=await r.json();lastResponse=performance.now();display(s);}
    catch{display({valid:false,health:'MONITOR_OFFLINE',sensors:{}});}
    setTimeout(poll,500);
}
measurement(lastModelCva,'ท่าอ้างอิง · ไม่ใช่ค่าปัจจุบัน');poll();

// Split triangles at the neck seam, interpolating UVs/normals rather than dropping crossing faces.
function clipAtY(geometry,cut,above){
    const attrs=Object.entries(geometry.attributes),out=Object.fromEntries(attrs.map(([k])=>[k,[]]));
    const count=geometry.index?geometry.index.count:geometry.attributes.position.count;
    const vertex=index=>Object.fromEntries(attrs.map(([key,a])=>[key,Array.from(a.array.slice(index*a.itemSize,(index+1)*a.itemSize))]));
    const inside=v=>above?v.position[1]>=cut:v.position[1]<=cut;
    for(let i=0;i<count;i+=3){
        const polygon=[0,1,2].map(n=>vertex(geometry.index?geometry.index.getX(i+n):i+n)),clipped=[];
        for(let j=0;j<3;j++){
            const a=polygon[j],b=polygon[(j+1)%3],ai=inside(a),bi=inside(b);
            if(ai)clipped.push(a);
            if(ai!==bi){const t=(cut-a.position[1])/(b.position[1]-a.position[1]);clipped.push(Object.fromEntries(attrs.map(([k])=>[k,a[k].map((v,n)=>v+(b[k][n]-v)*t)])));}
        }
        for(let j=1;j+1<clipped.length;j++)for(const v of [clipped[0],clipped[j],clipped[j+1]])for(const [k] of attrs)out[k].push(...v[k]);
    }
    const result=new THREE.BufferGeometry();for(const [k,a] of attrs)result.setAttribute(k,new THREE.Float32BufferAttribute(out[k],a.itemSize));return result;
}

async function init3D(){
    const canvas=el('head'),stage=el('stage'),scene=new THREE.Scene();
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    const camera=new THREE.PerspectiveCamera(33,1,.1,50);camera.position.set(4.6,3,6.7);
    const controls=new OrbitControls(camera,canvas);controls.target.set(0,1.65,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=5;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.57;
    scene.add(new THREE.HemisphereLight(0xdcefff,0x25303c,2.3));
    const key=new THREE.DirectionalLight(0xffe5ca,4.2);key.position.set(3,6,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=5;key.shadow.camera.bottom=-4;scene.add(key);
    const rim=new THREE.DirectionalLight(0x80c9ea,3);rim.position.set(-4,3,-3);scene.add(rim);
    const fill=new THREE.DirectionalLight(0x9bf6d8,1);fill.position.set(-3,1,4);scene.add(fill);
    const skin=new THREE.MeshStandardMaterial({color:0xb8c2c5,roughness:.57,metalness:.08});
    const shirt=new THREE.MeshStandardMaterial({color:0x263e50,roughness:.86});
    function sphere(parent,position,scale,material){const m=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),material);m.position.set(...position);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    // Torso is a fixed display reference: firmware does not expose independent torso orientation.
    const torso=sphere(scene,[0,.1,-.06],[1.3,.65,.58],shirt);
    const shoulderL=sphere(scene,[-.94,.65,0],[.64,.46,.55],shirt),shoulderR=sphere(scene,[.94,.65,0],[.64,.46,.55],shirt);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.27,.32,1,48),skin);neck.position.set(0,1.12,-.04);neck.castShadow=true;scene.add(neck);
    const head=new THREE.Group();head.position.set(0,1.48,0);scene.add(head);
    const loader=new GLTFLoader();
    try{
        const gltf=await loader.loadAsync('/assets/models/head/LeePerrySmith.glb');
        const original=gltf.scene.getObjectByProperty('isMesh',true);
        if(!original)throw Error('head mesh unavailable');
        let geo=original.geometry.clone();geo.computeBoundingBox();const box=geo.boundingBox,center=box.getCenter(new THREE.Vector3()),scale=1.95/(box.max.y-box.min.y);
        geo.translate(-center.x,-box.min.y,-center.z);geo.scale(scale,scale,scale);
        // The licensed scan includes shoulders. Remove that static section before head articulation.
        const bodyGeo=clipAtY(geo,.7,false);bodyGeo.translate(0,-.7,0);bodyGeo.scale(1.25,1.25,1.25);
        const bust=new THREE.Mesh(bodyGeo,skin);bust.position.y=1.36;bust.castShadow=true;bust.receiveShadow=true;scene.add(bust);
        shoulderL.visible=false;shoulderR.visible=false;
        const sourceGeometry=geo;geo=clipAtY(sourceGeometry,.7,true);sourceGeometry.dispose();geo.translate(0,-.7,0);geo.scale(1.25,1.25,1.25);
        const model=new THREE.Mesh(geo,skin.clone());model.position.y=-.12;model.castShadow=true;model.receiveShadow=true;head.add(model);
        new THREE.TextureLoader().load('/assets/models/head/Infinite-Level_02_Tangent_SmoothUV.jpg',normal=>{normal.flipY=false;model.material.normalMap=normal;model.material.normalScale.set(.45,.45);model.material.needsUpdate=true;});
        canvas.dataset.model='scan';
    }catch(error){
        console.warn('Head scan unavailable; showing procedural fallback.',error);
        sphere(head,[0,.93,0],[.58,.85,.65],skin);sphere(head,[0,.7,.62],[.12,.2,.18],skin);canvas.dataset.model='fallback';
    }
    const mountMaterial=new THREE.MeshStandardMaterial({color:0x142d33,roughness:.45,metalness:.35});
    const mounts={};
    function sensor(parent,id,position,color){
        const group=new THREE.Group();group.position.set(...position);parent.add(group);
        // Model is deliberately enlarged. PCB components clarify the attachment location,
        // not an unvalidated chip-to-body axis mapping.
        const board=new THREE.Group();group.add(board);
        function block(size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=true;board.add(m);return m;}
        const pcb=mountMaterial.clone();pcb.color.setHex(id==='c7'?0x163e77:0x142d33);
        block([.34,.42,.025],[0,0,0],pcb);
        const black=new THREE.MeshStandardMaterial({color:0x080c10,roughness:.7});
        block([.13,.14,.045],[0,.025,.035],black);
        const gold=new THREE.MeshStandardMaterial({color:0xd9b76b,metalness:.7,roughness:.3});
        for(const x of [-.13,.13])for(const y of [-.165,.165]){
            const hole=new THREE.Mesh(new THREE.TorusGeometry(.023,.006,8,20),gold);hole.position.set(x,y,.017);board.add(hole);
        }
        for(let i=0;i<5;i++){block([.018,.035,.018],[-.095+i*.047,-.185,.035],gold);block([.025,.042,.025],[-.115+i*.055,.125,.028],black);}
        const textCanvas=document.createElement('canvas');textCanvas.width=256;textCanvas.height=80;
        const textCtx=textCanvas.getContext('2d');textCtx.fillStyle='#e8fff5';textCtx.font='bold 32px sans-serif';textCtx.textAlign='center';textCtx.fillText(id==='c7'?'MPU6050':'BNO085',128,40);
        const textTex=new THREE.CanvasTexture(textCanvas);textTex.colorSpace=THREE.SRGBColorSpace;
        const print=new THREE.Mesh(new THREE.PlaneGeometry(.27,.085),new THREE.MeshBasicMaterial({map:textTex,transparent:true}));print.position.set(0,-.09,.027);board.add(print);
        const dot=new THREE.Mesh(new THREE.SphereGeometry(.022,16,12),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.9}));dot.position.set(.105,-.045,.04);board.add(dot);
        if(id==='c7')board.rotation.y=Math.PI;else board.rotation.x=-Math.PI/2;
        // Small dark bracket behind the ear / at the base of the neck.
        const bracket=new THREE.Mesh(new THREE.BoxGeometry(id==='c7'?.26:.13,.15,id==='c7'?.35:.12),black);bracket.position.set(id==='left'?-.07:id==='right'?.07:0,-.045,id==='c7'?.16:0);group.add(bracket);
        mounts[id]={group,dot,color};return group;
    }
    // Anatomical attachment markers are illustrative; address names do not identify physical placement.
    sensor(head,'left',[.58,.53,.02],0x71e4c0);sensor(head,'right',[-.58,.53,.02],0x71e4c0);sensor(scene,'c7',[0,1.1,-.88],0xefb975);
    // Always-visible anatomical landmark, independent of MPU presence/freshness.
    const c7Landmark=new THREE.Vector3(0,1.16,-.43);
    const c7Point=new THREE.Mesh(new THREE.SphereGeometry(.045,20,16),new THREE.MeshBasicMaterial({color:0xffbd7a,depthTest:false}));c7Point.position.copy(c7Landmark);c7Point.renderOrder=10;scene.add(c7Point);
    const c7Halo=new THREE.Mesh(new THREE.TorusGeometry(.085,.008,8,48),new THREE.MeshBasicMaterial({color:0xffbd7a,depthTest:false,transparent:true,opacity:.85}));c7Halo.position.copy(c7Landmark);c7Halo.renderOrder=9;scene.add(c7Halo);
    const referenceLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([c7Landmark,new THREE.Vector3(0,c7Landmark.y,1.1)]),new THREE.LineDashedMaterial({color:0xefb975,dashSize:.055,gapSize:.045,transparent:true,opacity:.55,depthTest:false}));referenceLine.computeLineDistances();referenceLine.renderOrder=8;scene.add(referenceLine);
    const ringMat=new THREE.MeshBasicMaterial({color:0x527b86,transparent:true,opacity:.4});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.79,.006,8,100),ringMat);ring.rotation.y=Math.PI/2;ring.position.set(0,1.9,0);scene.add(ring);
    const arcLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x71e4c0}));scene.add(arcLine);
    const ray=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0x71e4c0,dashSize:.06,gapSize:.04,transparent:true,opacity:.75}));scene.add(ray);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(3.2,96),new THREE.MeshStandardMaterial({color:0x172b37,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.53;floor.receiveShadow=true;scene.add(floor);
    const floorRing=new THREE.Mesh(new THREE.TorusGeometry(2.25,.008,8,100),new THREE.MeshBasicMaterial({color:0x3c5a65}));floorRing.rotation.x=Math.PI/2;floorRing.position.y=-.52;scene.add(floorRing);
    const grid=new THREE.GridHelper(6,20,0x3e5d65,0x293c4c);grid.position.y=-.515;grid.material.transparent=true;grid.material.opacity=.28;scene.add(grid);
    const target=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'YXZ'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let previous=performance.now();
    function place(id,position,dx,dy){
        const p=position.clone().project(camera),label=el(id),w=stage.clientWidth,h=stage.clientHeight;
        label.style.display=labelsVisible&&p.z<1?'flex':'none';
        const x=Math.max(8,Math.min(w-label.offsetWidth-8,(p.x*.5+.5)*w+dx));
        const y=Math.max(8,Math.min(h-label.offsetHeight-45,(-p.y*.5+.5)*h+dy));label.style.transform=`translate(${x}px,${y}px)`;
    }
    const resize=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(stage);
    function render(now){
        const dt=Math.min((now-previous)/1000,.1);previous=now;
        if(state.valid&&now-lastResponse>3000)display({valid:false,health:'STALE',sensors:{}});
        euler.set(THREE.MathUtils.degToRad(pose.head_pitch),THREE.MathUtils.degToRad(pose.head_yaw),THREE.MathUtils.degToRad(pose.head_roll),'YXZ');target.setFromEuler(euler);
        // Keep the final displayed pose stationary when telemetry is invalid.
        if(state.valid)head.quaternion.slerp(target,reduced?1:1-Math.exp(-dt*8));
        const pitch=THREE.MathUtils.degToRad(pose.head_pitch),origin=new THREE.Vector3(0,1.9,0),pts=[];
        for(let i=0;i<=48;i++){const t=pitch*i/48;pts.push(new THREE.Vector3(0,origin.y-Math.sin(t)*.79,Math.cos(t)*.79));}
        arcLine.geometry.dispose();arcLine.geometry=new THREE.BufferGeometry().setFromPoints(pts);
        ray.geometry.dispose();ray.geometry=new THREE.BufferGeometry().setFromPoints([origin,new THREE.Vector3(0,origin.y-Math.sin(pitch),Math.cos(pitch))]);ray.computeLineDistances();
        controls.update();scene.updateMatrixWorld();
        // A soft connector keeps the illustrative neck continuous as the rigid scan turns.
        const neckBase=new THREE.Vector3(0,1.12,-.04),neckTop=head.localToWorld(new THREE.Vector3(0,.26,-.04)),neckDirection=neckTop.clone().sub(neckBase);
        neck.position.copy(neckBase).add(neckTop).multiplyScalar(.5);neck.scale.y=neckDirection.length();neck.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),neckDirection.normalize());
        c7Halo.quaternion.copy(camera.quaternion);
        for(const id of ['left','right','c7']){
            const fresh=state.sensors?.[id==='c7'?'c7_fresh':id+'_fresh']===true,m=mounts[id];m.dot.material.color.setHex(fresh?m.color:0x697485);m.dot.material.emissiveIntensity=fresh?1:0;
        }
        place('label-left',mounts.left.group.getWorldPosition(new THREE.Vector3()),35,-50);
        place('label-right',mounts.right.group.getWorldPosition(new THREE.Vector3()),-180,5);
        place('label-c7',mounts.c7.group.getWorldPosition(new THREE.Vector3()),35,35);
        place('label-landmark',c7Landmark,-190,-30);
        el('label-landmark').style.display=c7Visible?'block':'none';
        for(const id of ['left','right','c7']){mounts[id].group.visible=sensorVisible[id];if(!sensorVisible[id])el('label-'+id).style.display='none';}
        canvas.dataset.visibleSensors=Object.keys(sensorVisible).filter(id=>sensorVisible[id]).join(',');
        c7Point.visible=c7Visible;c7Halo.visible=c7Visible;referenceLine.visible=c7Visible;
        place('angle-label',new THREE.Vector3(0,2.1,1),12,15);
        renderer.render(scene,camera);requestAnimationFrame(render);
    }
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
        document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));
        const positions={perspective:[4.6,3,6.7],side:[7.7,2.4,.1],front:[0,2.7,8],back:[-3,3,-7.2]};camera.position.set(...positions[button.dataset.view]);controls.target.set(0,1.65,0);controls.update();
    }));
    el('labels').onclick=()=>{labelsVisible=!labelsVisible;el('labels').setAttribute('aria-pressed',String(labelsVisible));};
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();el('render-error').hidden=false;});
    requestAnimationFrame(render);
}
init3D().catch(error=>{el('render-error').hidden=false;console.error('3D initialization failed',error);});
