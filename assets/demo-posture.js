// A temporal proxy on model-estimated CVA, not a measurement of head translation.
export class PostureTracker {
    constructor(){this.reset();}
    reset(){this.session=null;this.since=null;this.lastTime=null;this.lastStamp=null;this.elapsed=0;}
    update(state,now){
        if(state.valid!==true||!Number.isFinite(state.angles?.cva_angle)){this.reset();return {kind:'waiting',seconds:0};}
        if(state.session!==this.session||this.lastTime!==null&&now-this.lastTime>2500){this.since=null;this.elapsed=0;this.lastStamp=null;}
        this.session=state.session;this.lastTime=now;
        const delta=52.05-state.angles.cva_angle;
        if(delta<5){this.since=null;this.elapsed=0;this.lastStamp=state.updated_at;return {kind:'reference',seconds:0,delta};}
        if(this.since===null)this.since=now;
        const seconds=this.lastStamp===state.updated_at?this.elapsed:Math.min(10,(now-this.since)/1000);
        this.elapsed=seconds;this.lastStamp=state.updated_at;
        return {kind:seconds>=10?'suspected':'observing',seconds,delta};
    }
}
