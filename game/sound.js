"use strict";

const AudioMix={
    names:["Radio off","Crown FM 88.3","West River 103.7"],
    station:1, muted:false, beat:0, next:0, active:false,
    start(){
        if(!this.ctx){
            const AudioAPI=window.AudioContext||window.webkitAudioContext;
            if(!AudioAPI) return;
            this.ctx=new AudioAPI();
            const c=this.ctx;
            this.master=c.createGain();
            this.master.gain.value=.22;
            this.master.connect(c.destination);
            this.motor=c.createOscillator();
            this.motor.type="sawtooth";
            this.motorFilter=c.createBiquadFilter();
            this.motorFilter.frequency.value=160;
            this.motorVolume=c.createGain();
            this.motorVolume.gain.value=0;
            this.motor.connect(this.motorFilter).connect(this.motorVolume).connect(this.master);
            this.motor.start();
            const buffer=c.createBuffer(1,c.sampleRate*.17,c.sampleRate);
            const data=buffer.getChannelData(0);
            for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
            this.noise=buffer;
        }
        this.ctx.resume().catch(()=>{});
        this.active=true;
        this.next=this.ctx.currentTime+.08;
        this.level();
    },
    level(){
        if(this.ctx) this.master.gain.setTargetAtTime(this.active&&!this.muted?.24:0,this.ctx.currentTime,.04);
    },
    pause(){ this.active=false;this.level(); },
    tone(freq,at,length,level,type="sine",end=freq){
        const c=this.ctx;
        if(!c||!this.active||this.muted) return;
        const osc=c.createOscillator(),amp=c.createGain();
        osc.type=type;
        osc.frequency.setValueAtTime(freq,at);
        osc.frequency.exponentialRampToValueAtTime(end,at+length);
        amp.gain.setValueAtTime(.0001,at);
        amp.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+.014);
        amp.gain.exponentialRampToValueAtTime(.0001,at+length);
        osc.connect(amp).connect(this.master);
        osc.start(at);osc.stop(at+length+.02);
        osc.onended=()=>{osc.disconnect();amp.disconnect();};
    },
    hiss(at,length,level,frequency){
        const c=this.ctx,src=c.createBufferSource(),amp=c.createGain(),filter=c.createBiquadFilter();
        src.buffer=this.noise;filter.type="highpass";filter.frequency.value=frequency;
        amp.gain.setValueAtTime(level,at);
        amp.gain.exponentialRampToValueAtTime(.0001,at+length);
        src.connect(filter).connect(amp).connect(this.master);
        src.start(at);src.stop(at+length);
        src.onended=()=>{src.disconnect();filter.disconnect();amp.disconnect();};
    },
    effect(kind){
        if(!this.ctx||this.muted||!this.active) return;
        const t=this.ctx.currentTime;
        if(kind==="horn"){this.tone(194,t,.32,.37,"triangle");this.tone(244,t,.31,.24,"triangle");}
        if(kind==="hit"){this.hiss(t,.14,.5,280);this.tone(95,t,.14,.38,"sine",35);}
        if(kind==="pickup"){this.tone(392,t,.16,.29);this.tone(587,t+.11,.2,.22);}
        if(kind==="win") [0,4,7,12].forEach((n,i)=>this.tone(293.66*2**(n/12),t+i*.12,.45,.22,"triangle"));
    },
    update(speed,driving,throttle,heat){
        const c=this.ctx;
        if(!c||!this.active) return;
        const t=c.currentTime;
        this.motor.frequency.setTargetAtTime(32+(Math.abs(speed)%13)*2.4+Math.abs(speed)*.7+(throttle?8:0),t,.11);
        this.motorVolume.gain.setTargetAtTime(driving?.085+Math.min(Math.abs(speed),40)*.002:0,t,.12);
        if(this.next<t-.2) this.next=t+.04;
        while(this.next<t+.10){
            const at=this.next,i=this.beat++,step=i%16;
            const night=this.station===2;
            if(this.station&&!this.muted){
                const bass=(night?[45,41,48,43]:[50,46,53,48])[Math.floor(i/16)%4];
                const hz=n=>440*2**((n-69)/12);
                if(step%4===0) this.tone(112,at,.17,.59,"sine",39);
                if(step%8===4) this.hiss(at,.105,.30,700);
                if(step%2===0) this.hiss(at,.037,.105,5400);
                if([0,3,6,8,11,14].includes(step)) this.tone(hz(bass-12+(step===14?7:0)),at,.21,.29,"triangle");
                if(step===0||step===10){
                    for(const n of [0,3,7,10]) this.tone(hz(bass+n+12),at,night?.88:.52,.06,"sine");
                }
                if([2,7,10,13].includes(step)) this.tone(hz(bass+[12,19,15,22][[2,7,10,13].indexOf(step)]),at,.32,.10,"triangle");
            }
            if(heat&&step%8===0) this.tone(step===0?420:560,at,.5,.075,"sine",step===0?590:420);
            this.next+=60/(night?82:103)/4;
        }
    }
};
