"use strict";

const keys=new Set();
const save=readSave();
const actor=(model,x,z,a,color)=>({model,x,z,a,color,y:.07});
const game={
    mode:"title",started:false,ready:false,elapsed:0,story:true,replayId:null,chaseArmed:false,step:0,clock:0,stageTime:0,
    heat:0,escape:0,busted:0,strikes:0,hitCooldown:0,orbit:0,orbitHold:0,lookPitch:0,
    route:[],waypoint:null,fare:null,uiClock:0,gpsClock:0,tickerTime:0,parked:[],traffic:[],people:[],patrols:[],
    cam:{x:0,y:0,z:0,right:[0,0,0],up:[0,0,0],forward:[0,0,0],fov:1.05,yaw:-Math.PI/2},
    get player(){return this.car||this.walker;},
    get jobId(){return this.replayId??save.job;},
    get job(){return this.story?JOBS[this.jobId]:null;},
    get stage(){return this.job?.stages[this.step];},
    get objective(){
        if(this.fare)return this.fare.onboard?this.fare.drop:this.fare.pick;
        const s=this.stage;return s&&s[0]!=="escape"?{x:s[1],z:s[2]}:null;},
    get destination(){return this.waypoint||this.objective;},
    store(){
        try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}
        catch{UI.say("Browser storage is unavailable. Progress will last for this session.",5);}
    },
    populate(){
        this.parked=CITY.parked.map(([x,z,a,type],i)=>({...actor(VEHICLES[type].model,x,z,a,
            type===2?TAXI:PAINTS[(i===0?save.paint:i)%PAINTS.length]),type,speed:0,travelYaw:a}));
        this.car=this.parked[0];
        this.walker=actor("person",this.car.x,this.car.z,this.car.a,COATS[0]);
        this.traffic=CITY.traffic.map(([from,to,t,type],i)=>{
            const car={...actor(VEHICLES[type].model,0,0,0,type===2?TAXI:PAINTS[(i+2)%PAINTS.length]),
                type,from,to,travel:t*gap(nodes[from],nodes[to]),cruise:7.2+i%6,hold:0};
            lanePosition(car);return car;
        });
        this.people=CITY.people.map(([x,z,tx,tz,t,coat])=>({...actor("person",x,z,0,COATS[coat]),x0:x,z0:z,tx,tz,t,dir:1,stride:.82}));
        this.vehicles=[...this.parked,...this.traffic];
        for(const person of this.people)person.y=.25;
        this.records=CITY.records.map(([x,z],id)=>({...actor("record",x,z,0,WHITE),id}));
        this.marker=actor("marker",0,0,0,WHITE);
        this.rider=actor("person",0,0,0,COATS[2]);
        this.ferries=[actor("ferry",212,107,0,WHITE),actor("ferry",-148,-35,0,WHITE),actor("ferry",40,265,Math.PI/2,WHITE)];
        this.towHome();
        this.snapCamera();
    },
    towHome(){
        const car=this.car||this.parked[0];
        this.car=car;this.fare=null;this.chaseArmed=false;
        car.x=278;car.z=74.9;car.a=-Math.PI/2;car.travelYaw=car.a;car.speed=0;
        this.orbit=0;this.orbitHold=0;this.hitCooldown=2;this.strikes=0;
        this.clearHeat();this.gpsClock=0;
    },
    snapCamera(){this.cam.yaw=this.player.a;this.camera(1,true);},
    start(){
        if(!this.ready||this.started)return;
        this.started=true;this.mode="play";
        this.story=save.job<JOBS.length;
        this.uiClock=0;
        AudioMix.start();
        UI.enterGame();
        if(this.job) UI.say(this.job.voice+"  /  "+this.job.intro,8);
        else UI.say("Crown FM is on air. Liberty City is yours.",5);
    },
    nearestVehicle(){
        let best=null,dist=4.9;
        for(const v of this.vehicles){
            const d=gap(this.walker,v);
            if(d<dist){dist=d;best=v;}
        }
        return best;
    },
    enterExit(){
        if(this.car){
            const car=this.car;
            if(Math.abs(car.speed)>3){UI.say("Slow down to get out.",2);return;}
            const co=Math.cos(car.a),si=Math.sin(car.a);
            const sides=[[co*2,-si*2],[-co*2,si*2],[-si*3,-co*3],[si*3,co*3]];
            const exit=sides.find(([dx,dz])=>passable(car.x+dx,car.z+dz,.3));
            if(!exit){UI.say("Pull away from the wall to open the door.",2);return;}
            Object.assign(this.walker,{x:car.x+exit[0],z:car.z+exit[1],a:car.a,stride:0});
            car.speed=0;this.car=null;
            if(this.fare){this.fare=null;UI.say("Cab shift ended.",3);}
        }else{
            const car=this.nearestVehicle();
            if(!car){UI.say("Walk up to a car to get in.",2);return;}
            const index=this.traffic.indexOf(car);
            if(index>=0){
                this.traffic.splice(index,1);
                this.parked.push(car);
                this.setHeat(1);
            }
            this.car=car;car.speed=0;car.travelYaw=car.a;
            this.orbit=0;this.orbitHold=0;
        }
        this.gpsClock=0;UI.update();
    },
    toggleFare(){
        if(this.fare){
            this.fare=null;this.gpsClock=0;UI.say("Cab shift ended.",3);return;
        }
        if(this.story||this.car?.model!=="taxi")return;
        const stops=[{x:288,z:119},{x:432,z:-91},{x:-72,z:106},{x:144,z:199},{x:-360,z:-93},{x:-216,z:118}];
        const sorted=stops.slice().sort((a,b)=>gap(this.player,a)-gap(this.player,b));
        const pick=sorted.slice(0,3)[Math.floor(Math.random()*3)];
        const far=stops.filter(stop=>gap(stop,pick)>160);
        const drop=far[Math.floor(Math.random()*far.length)];
        const path=streetRoute(pick,drop);
        let length=0;
        for(let i=1;i<path.length;i++)length+=gap(path[i-1],path[i]);
        this.fare={pick,drop,onboard:false,pay:Math.round(55+length*.33)};
        this.rider.x=pick.x+6;this.rider.z=pick.z;
        this.waypoint=null;this.gpsClock=0;UI.say("Cab dispatch  /  A passenger is waiting in "+districtAt(pick.x,pick.z)+".",4);
    },
    taxiProgress(){
        if(!this.fare||!this.car||Math.abs(this.car.speed)>2.8||gap(this.car,this.objective)>8)return;
        if(this.fare.onboard){
            const pay=this.fare.pay;
            this.fare=null;save.cash+=pay;this.store();AudioMix.effect("win");
            UI.say("Fare complete  /  +$"+pay+"  ·  T for another fare",5);
        }else{
            this.fare.onboard=true;AudioMix.effect("pickup");
            UI.say("Passenger aboard  /  "+districtAt(this.fare.drop.x,this.fare.drop.z),4);
        }
        this.gpsClock=0;
    },
    recordNear(){
        return this.records.find(r=>!save.records.includes(r.id)&&gap(this.player,r)<3.4);
    },
    interact(){
        const s=this.stage;
        if(s&&this.objective&&gap(this.player,this.objective)<(s[0]==="foot"?4.2:8)){
            if(s[0]==="foot"&&!this.car){this.advance();return;}
            if(s[0]==="tune"&&(!this.car||Math.abs(this.car.speed)<2)){this.advance();return;}
        }
        const record=this.recordNear();
        if(record&&!this.car){
            save.records.push(record.id);save.cash+=100;this.store();
            AudioMix.effect("pickup");UI.say("Rare pressing recovered · "+save.records.length+"/"+this.records.length+"  /  +$100",4);
            UI.update();return;
        }
        if(this.car&&gap(this.car,GARAGE)<9&&Math.abs(this.car.speed)<2){
            save.paint=(save.paint+1)%PAINTS.length;this.car.color=PAINTS[save.paint];
            this.store();UI.say("Red Hook Motor Works  /  Fresh paint.",3);
        }
    },
    setHeat(level){
        if(this.heat>=level) return;
        this.heat=level;this.escape=0;this.busted=0;
        const candidates=nodes.filter(n=>gap(n,this.player)>55&&gap(n,this.player)<136)
            .sort((a,b)=>gap(a,this.player)-gap(b,this.player));
        while(this.patrols.length<level&&candidates.length){
            const start=candidates.splice(this.patrols.length?Math.floor(candidates.length/2):0,1)[0];
            const car={...actor("patrol",start.x,start.z,0,[.28,.33,.40]),from:start.id,to:start.links[0].id,travel:0,cruise:16};
            this.patrols.push(car);
        }
        UI.say(level===2?"Dispatch  /  Two patrols are on the move.":"Dispatch  /  Patrol alerted.",3);
    },
    clearHeat(){this.heat=0;this.escape=0;this.busted=0;this.patrols.length=0;},
    updatePatrol(dt){
        if(!this.heat) return;
        let closest=Infinity;
        for(const cop of this.patrols){
            const dist=gap(cop,this.player);
            if(dist>5){
                const target=this.player;
                moveTraffic(cop,dt,(from,previous)=>{
                    const snap=snapRoad(target);
                    const dest=gap(nodes[from],snap.road.a)<gap(nodes[from],snap.road.b)?snap.road.a:snap.road.b;
                    if(from===dest.id){
                        if(snap.road.a.id===from)return snap.road.b.id;
                        return snap.road.a.id;
                    }
                    return shortestPath(from,dest.id)[1]??previous;
                });
            }
            closest=Math.min(closest,dist);
        }
        if(closest>52)this.escape+=dt;
        else this.escape=Math.max(0,this.escape-dt*.6);
        this.busted=closest<8&&(!this.car||Math.abs(this.car.speed)<3.8)?this.busted+dt:Math.max(0,this.busted-dt*1.5);
        if(this.busted>5.5){
            this.fail("Busted","Crown called in a favor. Your car is back at the Broker waterfront.");
        }else if(this.escape>=8){
            this.clearHeat();
            if(this.stage?.[0]==="escape"&&this.chaseArmed)this.advance();
            else UI.say("Patrol lost.",3);
        }
    },
    damage(impact){
        if(this.hitCooldown>0||impact<5)return;
        this.hitCooldown=1.5;AudioMix.effect("hit");
        if(impact>10&&++this.strikes>=3){this.strikes=0;this.setHeat(1);}
    },
    drive(dt){
        const car=this.car,spec=VEHICLES[car.type];
        const gas=keys.has("KeyW"),brake=keys.has("KeyS"),slide=keys.has("Space");
        const steer=Number(keys.has("KeyA"))-Number(keys.has("KeyD"));
        if(gas)car.speed+=(car.speed<-.2?27:spec.accel*(1-.59*Math.max(0,car.speed)/spec.top))*dt;
        if(brake)car.speed-=(car.speed>1?29:7.2)*dt;
        const drag=((gas||brake) ? .28 : 1.65)+.0028*car.speed*car.speed+(slide?10:0);
        car.speed=Math.sign(car.speed)*Math.max(0,Math.abs(car.speed)-drag*dt);
        car.speed=clamp(car.speed,-9,spec.top);
        const v=Math.abs(car.speed);
        car.a+=steer*spec.turn*clamp(v/6,0,1)*(1-.46*Math.min(1,v/40))*(slide?1.65:1)*Math.sign(car.speed)*dt;
        car.travelYaw+=angleDiff(car.travelYaw,car.a)*(1-Math.exp(-dt*(slide?2.1:8.6)));
        const dx=Math.sin(car.travelYaw)*car.speed*dt,dz=Math.cos(car.travelYaw)*car.speed*dt;
        const nx=car.x+dx,nz=car.z+dz;
        const clear=(x,z)=>{
            const sx=Math.sin(car.a)*1.25,sz=Math.cos(car.a)*1.25;
            return passable(x+sx,z+sz,.86)&&passable(x-sx,z-sz,.86);
        };
        if(clear(nx,nz)){car.x=nx;car.z=nz;}
        else{
            if(clear(nx,car.z))car.x=nx;
            else if(clear(car.x,nz))car.z=nz;
            this.damage(v);car.speed*=-.18;car.travelYaw=car.a;
        }
        for(const other of this.vehicles){
            if(other===car||gap(car,other)>3.65)continue;
            const ox=car.x-other.x,oz=car.z-other.z;
            const side=Math.abs(ox*Math.cos(other.a)-oz*Math.sin(other.a));
            if(side>1.85)continue;
            const dist=Math.max(.01,Math.hypot(ox,oz)),push=Math.min(.6,3.8-dist);
            const px=car.x+ox/dist*push,pz=car.z+oz/dist*push;
            if(clear(px,pz)){car.x=px;car.z=pz;}
            this.damage(v);car.speed*=.55;other.hold=1.3;
        }
        this.walker.stride=0;
    },
    walk(dt){
        const person=this.walker;
        const forward=Number(keys.has("KeyW"))-Number(keys.has("KeyS"));
        const right=Number(keys.has("KeyD"))-Number(keys.has("KeyA"));
        const norm=Math.hypot(forward,right);
        person.stride=norm?(keys.has("ShiftLeft")||keys.has("ShiftRight")?1.5:1):0;
        if(!norm)return;
        const yaw=this.cam.yaw;
        const dx=(Math.sin(yaw)*forward-Math.cos(yaw)*right)/norm,dz=(Math.cos(yaw)*forward+Math.sin(yaw)*right)/norm;
        const speed=person.stride>1?7.6:3.8;
        if(passable(person.x+dx*speed*dt,person.z,.3))person.x+=dx*speed*dt;
        if(passable(person.x,person.z+dz*speed*dt,.3))person.z+=dz*speed*dt;
        person.a+=angleDiff(person.a,Math.atan2(dx,dz))*(1-Math.exp(-dt*16));
    },
    advance(){
        const job=this.job;
        if(!job)return;
        this.step++;this.chaseArmed=false;this.stageTime=0;this.gpsClock=0;this.waypoint=null;
        if(this.step>=job.stages.length){
            let detail=job.name+" is on the air.";
            if(job.limit){
                const time=job.limit-this.clock;
                if(!save.best||time<save.best)save.best=time;
                detail="Run time "+time.toFixed(1)+" s  ·  Personal best "+save.best.toFixed(1)+" s";
            }
            const wasReplay=this.replayId!==null;
            save.cash+=job.fee;
            if(!wasReplay)save.job++;
            this.replayId=null;this.step=0;this.clock=0;this.clearHeat();this.store();
            if(save.job>=JOBS.length){
                if(!wasReplay)detail="All three boroughs are tuned to Crown FM. The night is yours.";
                this.story=false;
            }
            AudioMix.effect("win");
            UI.complete(job.name,job.fee,detail);
        }else{
            if(job.limit&&this.step===1)this.clock=job.limit;
            AudioMix.effect("pickup");
            const s=this.stage;
            if(s[0]==="escape")UI.say("Mina  /  Get the transmitter into a car. The patrol is listening.",4);
        }
        UI.update();
    },
    fail(title,reason){
        this.step=0;this.clock=0;this.stageTime=0;this.waypoint=null;
        this.towHome();this.snapCamera();
        UI.result(title,reason);
    },
    progress(dt){
        const s=this.stage;
        if(!s)return;
        this.stageTime+=dt;
        if(this.job.limit&&this.step>0){
            this.clock-=dt;
            if(this.clock<=0){this.fail("Time ran out","Sol has another slot. Meet him at the Broker starting line to run it again.");return;}
        }
        if(s[0]==="escape"){
            if(this.car&&!this.chaseArmed){this.chaseArmed=true;this.setHeat(2);}
            return;
        }
        if(!this.car)return;
        const d=Math.hypot(this.car.x-s[1],this.car.z-s[2]);
        if((s[0]==="gate"&&d<10)||(s[0]==="drive"&&d<8&&Math.abs(this.car.speed)<3.1))this.advance();
    },
    tick(dt){
        this.elapsed+=dt;this.hitCooldown=Math.max(0,this.hitCooldown-dt);
        this.tickerTime=Math.max(0,this.tickerTime-dt);
        this.orbitHold=Math.max(0,this.orbitHold-dt);
        if(this.car)this.drive(dt);else this.walk(dt);
        for(const car of this.traffic){
            if(car.hold>0){car.hold-=dt;continue;}
            const player=this.player,dx=player.x-car.x,dz=player.z-car.z;
            const ahead=dx*Math.sin(car.a)+dz*Math.cos(car.a);
            const side=Math.abs(dx*Math.cos(car.a)-dz*Math.sin(car.a));
            if(ahead>0&&ahead<8&&side<2.35)continue;
            moveTraffic(car,dt,nextTraffic);
        }
        for(const p of this.people){
            p.t+=dt*.034*p.dir;
            if(p.t>=1||p.t<=0){p.t=clamp(p.t,0,1);p.dir*=-1;}
            p.x=mix(p.x0,p.tx,p.t);p.z=mix(p.z0,p.tz,p.t);p.a=p.dir>0?0:Math.PI;
        }
        this.updatePatrol(dt);
        if(this.mode!=="play")return;
        this.progress(dt);
        this.taxiProgress();
        for(let i=0;i<this.ferries.length;i++){
            const f=this.ferries[i],phase=this.elapsed*(i===2?.015:.027)+i,along=Math.sin(phase);
            if(i===2){f.x=along*177;f.z=270;f.a=Math.cos(phase)>0?Math.PI/2:-Math.PI/2;}
            else{f.z=(i===0?154:0)+along*43;f.a=Math.cos(phase)>0?0:Math.PI;}
            f.y=-1.71+Math.sin(this.elapsed*1.4+i)*.07;
        }
        if(this.waypoint&&gap(this.player,this.waypoint)<7){this.waypoint=null;this.gpsClock=0;UI.say("Waypoint reached.",2);}
        this.camera(dt);
        this.uiClock-=dt;this.gpsClock-=dt;
        if(this.gpsClock<=0){
            this.route=streetRoute({x:this.player.x,z:this.player.z},this.destination);
            this.gpsClock=.6;
        }
        if(this.uiClock<=0){UI.update();this.uiClock=.095;}
    },
    camera(dt,snap=false){
        const player=this.player,c=this.cam;
        if(this.car){
            if(this.orbitHold<=0)this.orbit*=Math.exp(-dt*2.9);
            const target=player.a+this.orbit+(keys.has("KeyQ")?Math.PI:0);
            c.yaw+=angleDiff(c.yaw,target)*(snap?1:1-Math.exp(-dt*5.9));
        }
        const s=Math.sin(c.yaw),co=Math.cos(c.yaw);
        const targetHeight=this.car?1.18:1.24;
        const distance=this.car?8.2+Math.min(2.7,Math.abs(player.speed)*.062):4.5;
        let actual=distance;
        const height=(this.car?3.1:2.1)+this.lookPitch;
        for(let d=.55;d<distance;d+=.5){
            if(buildingAt(player.x-s*d,player.z-co*d,.25,targetHeight+height*d/distance)){
                actual=Math.max(.38,d-.45);break;
            }
        }
        c.x=player.x-s*actual;c.z=player.z-co*actual;c.y=targetHeight+height*actual/distance;
        const pitch=-Math.atan2(height,distance+(this.car?5.1:2.2));
        const cp=Math.cos(pitch),sp=Math.sin(pitch);
        c.right[0]=-co;c.right[1]=0;c.right[2]=s;
        c.up[0]=-s*sp;c.up[1]=cp;c.up[2]=-co*sp;
        c.forward[0]=s*cp;c.forward[1]=sp;c.forward[2]=co*cp;
        c.fov=1.04+(this.car?Math.abs(player.speed)*.0022:0);
    },
    actors(){
        const list=[...this.vehicles,...this.people,...this.patrols,...this.ferries];
        if(this.fare&&!this.fare.onboard)list.push(this.rider);
        if(!this.car){
            this.walker.y=pavementHeight(this.walker.x,this.walker.z);list.push(this.walker);
        }
        for(const r of this.records)if(!save.records.includes(r.id))list.push(r);
        const dest=this.destination;
        if(dest){this.marker.y=pavementHeight(dest.x,dest.z);this.marker.x=dest.x;this.marker.z=dest.z;this.marker.a=this.elapsed*.25;list.push(this.marker);}
        return list;
    }
};
const GARAGE={x:432,z:-87};
