"use strict";

const $=id=>document.getElementById(id);
const MAP_BOUNDS={left:-495,right:500,top:-272,bottom:277};
const mapBase=document.createElement("canvas");
mapBase.width=1194;mapBase.height=659;
const baseScale=mapBase.width/(MAP_BOUNDS.right-MAP_BOUNDS.left);
function paintAtlas(){
    const ctx=mapBase.getContext("2d");
    ctx.scale(baseScale,baseScale);ctx.translate(-MAP_BOUNDS.left,-MAP_BOUNDS.top);
    ctx.fillStyle="#34424d";ctx.fillRect(-510,-285,1040,590);
    ctx.strokeStyle="#41515a";ctx.lineWidth=.6;
    for(let z=-280;z<290;z+=12){
        ctx.beginPath();
        for(let x=-510;x<520;x+=9){
            const y=z+Math.sin(x*.032+z)*1.25;
            if(x===-510)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.stroke();
    }
    for(const [x,z,r,b] of CITY.land){ctx.fillStyle="#54515c";ctx.fillRect(x,z,r-x,b-z);}
    for(const [x,z,r,b,park] of CITY.blocks){ctx.fillStyle=park?"#62715d":"#635d66";ctx.fillRect(x,z,r-x,b-z);}
    ctx.fillStyle="#716970";
    for(const [x,z,r,b] of CITY.solids)ctx.fillRect(x,z,r-x,b-z);
    for(const {a,b,bridge} of roads){
        ctx.beginPath();ctx.moveTo(a.x,a.z);ctx.lineTo(b.x,b.z);
        ctx.strokeStyle=bridge?"#a59a98":"#b3a5a0";ctx.lineWidth=bridge?5:3;ctx.stroke();
    }
}
paintAtlas();

function drawMap(canvas,large){
    const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
    const p=game.player;
    const scale=large?Math.min(w/(MAP_BOUNDS.right-MAP_BOUNDS.left),h/(MAP_BOUNDS.bottom-MAP_BOUNDS.top)):1.15;
    const cx=large?(MAP_BOUNDS.left+MAP_BOUNDS.right)/2:p.x,cz=large?(MAP_BOUNDS.top+MAP_BOUNDS.bottom)/2:p.z;
    const x=v=>(v-cx)*scale+w/2,z=v=>(v-cz)*scale+h/2;
    ctx.fillStyle="#34424d";ctx.fillRect(0,0,w,h);
    ctx.drawImage(mapBase,x(MAP_BOUNDS.left),z(MAP_BOUNDS.top),mapBase.width/baseScale*scale,mapBase.height/baseScale*scale);
    if(game.route.length){
        ctx.lineCap="round";ctx.lineJoin="round";
        ctx.beginPath();game.route.forEach((n,i)=>i?ctx.lineTo(x(n.x),z(n.z)):ctx.moveTo(x(n.x),z(n.z)));
        ctx.strokeStyle="#473443";ctx.lineWidth=large?5:5.6;ctx.stroke();
        ctx.strokeStyle=game.waypoint?"#8be1db":"#ffc582";ctx.lineWidth=large?2.7:3.1;ctx.stroke();
    }
    function dot(tx,tz,r,c){
        ctx.beginPath();ctx.arc(x(tx),z(tz),r,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle="#2e2934";ctx.stroke();
    }
    for(const r of game.records||[])if(!save.records.includes(r.id))dot(r.x,r.z,large?3.6:2.5,"#e5a5cb");
    if(large&&!game.story)for(const cab of game.parked)if(cab.model==="taxi")dot(cab.x,cab.z,3.6,"#ffd93d");
    dot(GARAGE.x,GARAGE.z,large?4:3,"#b9c76f");
    for(const cop of game.patrols)dot(cop.x,cop.z,3.8,Math.sin(game.elapsed*9)>0?"#f09185":"#91abf5");
    if(game.objective)dot(game.objective.x,game.objective.z,large?5:6,"#ffc582");
    if(game.waypoint)dot(game.waypoint.x,game.waypoint.z,large?5:6,"#8be1db");
    if(large){
        ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 13px monospace";
        for(const b of CITY.land){
            const mx=x((b[0]+b[2])/2),mz=z(b[1]-12),txt=b[4].toUpperCase();
            const width=ctx.measureText(txt).width+12;
            ctx.fillStyle="#33313e";ctx.fillRect(mx-width/2,mz-9,width,18);
            ctx.fillStyle="#f1ddc8";ctx.fillText(txt,mx,mz);
        }
    }
    ctx.save();ctx.translate(x(p.x),z(p.z));
    ctx.rotate(Math.PI-p.a);
    ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5.4,6);ctx.lineTo(0,3.4);ctx.lineTo(-5.4,6);ctx.closePath();
    ctx.fillStyle="#fff0d7";ctx.fill();ctx.strokeStyle="#45323e";ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    ctx.textAlign="left";ctx.font="bold 11px monospace";ctx.fillStyle="#2d2a35";ctx.fillRect(4,4,17,17);
    ctx.fillStyle="#f3e2cd";ctx.fillText("N",9,16);
    return {scale,cx,cz};
}

const UI={
    panel:"",back:"",lastFocus:null,
    say(message,time=4){$("ticker").textContent=message;game.tickerTime=time;},
    enterGame(){
        $("title").hidden=true;$("hud").hidden=false;
        $("world").focus();this.update();
    },
    update(){
        const p=game.player;
        if(!p)return;
        const job=game.job,s=game.stage;
        $("dispatchLabel").textContent=job?"Crown FM  /  Side "+String.fromCharCode(65+game.jobId):"Crown FM  /  Free roam";
        $("jobName").textContent=job?.name||(game.fare?"Night shift":"After hours");
        $("objective").textContent=s?.[3]||(game.fare?(game.fare.onboard?"Drop off your passenger in ":"Pick up your passenger in ")+districtAt(game.objective.x,game.objective.z)+".":null)||(save.records.length<CITY.records.length?"Find the rare pressings around Liberty City.":"All rare pressings recovered.");
        $("money").textContent="$"+save.cash.toLocaleString("en-US");
        $("heat").textContent=game.heat?("★".repeat(game.heat)+"  "+(game.busted>1?"BUST "+Math.floor(game.busted/5.5*100)+"%":game.escape>1?"CLEAR "+Math.floor(game.escape/8*100)+"%":"WANTED")):"";
        $("district").textContent=districtAt(p.x,p.z);
        $("radio").textContent=AudioMix.muted?"Audio muted":AudioMix.names[AudioMix.station];
        $("vehicle").textContent=game.car?VEHICLES[game.car.type].name:"On foot";
        $("speed").textContent=game.car?String(Math.round(Math.abs(game.car.speed)*2.23694)):"";
        $("unit").hidden=!game.car;
        const clock=job?.limit&&game.step>0?Math.max(0,game.clock):0;
        $("countdown").textContent=clock?"◷  "+Math.floor(clock/60)+":"+String(Math.floor(clock%60)).padStart(2,"0"):"";
        let hint="";
        if(s&&game.objective&&gap(p,game.objective)<12){
            if(s[0]==="foot")hint=game.car?"F  ·  Exit vehicle":gap(p,game.objective)<4.2?"E  ·  Collect":"Walk to the gold ring";
            if(s[0]==="tune")hint=game.car&&Math.abs(game.car.speed)>2?"Stop to tune the relay":"E  ·  Tune relay";
            if(s[0]==="drive")hint=game.car?"Stop inside the gold ring":"F  ·  Get a vehicle";
        }
        if(!hint&&!game.car&&game.recordNear())hint="E  ·  Pick up rare pressing";
        if(!hint&&!game.car&&game.nearestVehicle())hint="F  ·  Enter vehicle";
        if(!hint&&game.car&&gap(p,GARAGE)<9)hint="Stop + E  ·  Respray";
        if(!hint&&!game.story&&game.car?.model==="taxi")hint=game.fare?"T  ·  End fare":"T  ·  Take a taxi fare";
        if(!hint&&game.elapsed<14)hint="WASD  Drive    ·    Space  Handbrake    ·    M  Map";
        $("context").textContent=hint;
        if(!game.tickerTime)$("ticker").textContent="";
        drawMap($("radar"),false);
    },
    show(id,kicker,title,body,wide=false){
        if(!this.panel)this.lastFocus=document.activeElement;
        this.panel=id;game.mode="menu";keys.clear();AudioMix.pause();
        $("panelKicker").textContent=kicker;$("panelTitle").textContent=title;
        $("panelBody").innerHTML=body;$("panel").classList.toggle("wide",wide);
        $("veil").hidden=false;$("close").focus();
    },
    hide(){
        this.panel="";this.back="";$("veil").hidden=true;
        game.mode=game.started?"play":"title";keys.clear();
        if(game.started){AudioMix.start();$("world").focus();this.update();}
        else if(this.lastFocus?.isConnected)this.lastFocus.focus();
    },
    button(action,label,key=""){
        return '<button class="menuButton" data-action="'+action+'">'+label+'<i>'+key+'</i></button>';
    },
    pause(){
        const story=(save.job<JOBS.length||game.replayId!==null)?this.button("story",game.story?"Switch to free roam":"Resume story","↔"):"";
        this.show("pause","Liberty City","Paused",
            this.button("resume","Return to the city","Esc")+this.button("map","Street map","M")+this.button("controls","Controls","?")+
            this.button("options","Settings","⚙")+story+(save.job?this.button("replays","Replay a completed side","↻"):"")+this.button("tow","Tow to Broker","↗")+
            '<div class="statusText">'+save.job+'/'+JOBS.length+' sides aired  ·  '+save.records.length+'/'+CITY.records.length+' rare pressings</div>');
    },
    controls(from){
        this.back=from;
        const rows=[["Drive / walk","W A S D  /  Arrows"],["Brake / reverse","S"],["Handbrake / sprint","Space / Shift"],
            ["Enter / exit vehicle","F"],["Collect / tune / respray","E"],["Orbit camera","Drag / Z X"],["Look back / horn","Q / H"],
            ["Taxi shift in free roam","T"],["Change station / mute","R / V"],["Street map / pause","M / Esc"]];
        this.show("controls","Field guide","Controls",rows.map(([label,key])=>'<div class="row"><span>'+label+'</span><kbd>'+key+'</kbd></div>').join("")+
            '<div class="panelActions"><button class="primary" data-action="back">Back</button></div>');
    },
    options(){
        this.back="pause";
        this.show("options","Liberty City","Settings",
            '<label class="row">Graphics<select id="quality"><option value="auto">Adaptive</option><option value="low">Low</option><option value="high">High</option></select></label>'+
            '<label class="row">Sky<select id="light"><option value="cycle">Dusk to dawn</option><option value="sunset">Sunset</option><option value="midnight">Midnight</option></select></label>'+
            '<label class="row">Radio<select id="station"><option value="0">Off</option><option value="1">Crown FM 88.3</option><option value="2">West River 103.7</option></select></label>'+
            this.button("mute",save.muted?"Unmute audio":"Mute audio",save.muted?"Off":"On")+
            '<div class="statusText">Last frame rate '+(Render.fps||"—")+' FPS · '+Render.canvas.width+' × '+Render.canvas.height+'</div>'+
            '<div class="panelActions"><button class="primary" data-action="back">Back</button></div>');
        $("light").value=save.light;
        $("light").onchange=e=>{save.light=e.target.value;game.store();};
        $("quality").value=save.quality;$("station").value=save.radio;
        $("quality").onchange=e=>{Render.quality=save.quality=e.target.value;game.store();};
        $("station").onchange=e=>{AudioMix.station=save.radio=Number(e.target.value);game.store();};
    },
    map(from="play"){
        this.back=from;
        game.route=streetRoute({x:game.player.x,z:game.player.z},game.destination);
        this.show("map","Liberty City","Street map",
            '<canvas id="cityMap" width="840" height="464" aria-label="City map. Click a street to set a waypoint."></canvas>'+
            '<div class="legend"><span style="--swatch:#ffc582">Objective</span><span style="--swatch:#8be1db">Waypoint</span><span style="--swatch:#e5a5cb">Record</span><span style="--swatch:#b9c76f">Garage</span><span style="--swatch:#ffd93d">Cab (free roam)</span></div>'+
            '<div class="statusText" id="mapStatus">Select a street to set a waypoint.</div><div class="panelActions"><button class="secondary" data-action="clear">Clear waypoint</button><button class="primary" data-action="back">Back</button></div>',true);
        const canvas=$("cityMap"),view=drawMap(canvas,true);
        canvas.onclick=e=>{
            const r=canvas.getBoundingClientRect();
            const scale=Math.min(r.width/canvas.width,r.height/canvas.height);
            const px=(e.clientX-r.left-(r.width-canvas.width*scale)/2)/scale;
            const pz=(e.clientY-r.top-(r.height-canvas.height*scale)/2)/scale;
            const snap=snapRoad({x:(px-canvas.width/2)/view.scale+view.cx,z:(pz-canvas.height/2)/view.scale+view.cz});
            game.waypoint={x:snap.x,z:snap.z};game.gpsClock=0;
            game.route=streetRoute({x:game.player.x,z:game.player.z},game.destination);
            drawMap(canvas,true);$("mapStatus").textContent="Waypoint set · "+districtAt(snap.x,snap.z);
        };
    },
    complete(name,fee,detail){
        this.back="";
        this.show("complete",save.job===JOBS.length?"Crown FM · On air":"Side complete",name,
            '<p class="reward">+$'+fee.toLocaleString("en-US")+'</p><p class="bodyText">'+detail+'</p>'+
            '<div class="panelActions"><button class="primary" data-action="continue">'+(game.job?"Next side":"Free roam")+' <span class="arrow">→</span></button></div>');
    },
    result(title,detail){
        this.back="";
        this.show("retry","Crown dispatch",title,'<p class="bodyText">'+detail+'</p><div class="panelActions"><button class="primary" data-action="continue">Back to Broker <span class="arrow">→</span></button></div>');
    },
    close(){
        if(this.panel==="controls"||this.panel==="options"||this.panel==="map"||this.panel==="replays"){
            if(this.back==="pause"){this.back="";this.pause();return;}
        }
        const completed=this.panel==="complete"||this.panel==="retry";
        this.hide();
        if(completed&&game.job)this.say(game.job.voice+"  /  "+game.job.intro,7);
    },
    action(action){
        if(action==="resume"){this.hide();return;}
        if(action==="back"||action==="continue"){this.close();return;}
        if(action==="map"){this.map("pause");return;}
        if(action==="controls"){this.controls("pause");return;}
        if(action==="options"){this.options();return;}
        if(action==="mute"){save.muted=AudioMix.muted=!save.muted;AudioMix.level();game.store();this.options();return;}
        if(action==="clear"){game.waypoint=null;game.gpsClock=0;this.map(this.back);return;}
        if(action==="story"){
            game.fare=null;game.chaseArmed=false;game.replayId=null;game.story=!game.story;game.step=0;game.clock=0;game.waypoint=null;game.clearHeat();game.gpsClock=0;
            this.hide();this.say(game.job?game.job.voice+"  /  "+game.job.intro:"Free roam. Story progress is saved after each side.",6);return;
        }
        if(action==="replays"){
            this.back="pause";
            this.show("replays","Crown FM archives","Replay a side",
                JOBS.slice(0,save.job).map((j,i)=>this.button("side-"+i,j.name,"Side "+String.fromCharCode(65+i))).join(""));
            return;
        }
        if(action.startsWith("side-")){
            game.replayId=Number(action.slice(5));game.story=true;game.step=0;game.clock=0;
            game.waypoint=null;game.towHome();game.snapCamera();this.hide();this.say(game.job.voice+"  /  "+game.job.intro,6);return;
        }
        if(action==="tow"){
            game.step=0;game.clock=0;game.waypoint=null;game.towHome();game.snapCamera();this.hide();this.say("Your vehicle is back at the Broker waterfront.",3);
        }
    }
};

function gameKey(code){
    if(code==="KeyF")game.enterExit();
    if(code==="KeyT")game.toggleFare();
    if(code==="KeyE")game.interact();
    if(code==="KeyH"&&game.car)AudioMix.effect("horn");
    if(code==="KeyR"){
        save.radio=AudioMix.station=(save.radio+1)%AudioMix.names.length;game.store();UI.say(AudioMix.names[save.radio],2);
    }
    if(code==="KeyV"){save.muted=AudioMix.muted=!save.muted;AudioMix.level();game.store();UI.say(save.muted?"Audio muted":"Audio on",2);}
}
const aliases={ArrowUp:"KeyW",ArrowDown:"KeyS",ArrowLeft:"KeyA",ArrowRight:"KeyD"};
window.addEventListener("keydown",e=>{
    const code=aliases[e.code]||e.code;
    if(game.mode==="menu"){
        if(code==="Escape"||(code==="KeyM"&&UI.panel==="map")){e.preventDefault();UI.close();}
        if(code==="Tab"){
            const items=[...$("panel").querySelectorAll("button,select")];
            if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
            if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
        }
        return;
    }
    if(game.mode!=="play")return;
    if(["KeyW","KeyS","KeyA","KeyD","Space","Tab","Escape","KeyM"].includes(code))e.preventDefault();
    if(e.repeat)return;
    if(code==="Escape"){UI.pause();return;}
    if(code==="KeyM"){UI.map();return;}
    keys.add(code);gameKey(code);
});
window.addEventListener("keyup",e=>keys.delete(aliases[e.code]||e.code));
window.addEventListener("blur",()=>{keys.clear();if(game.mode==="play")UI.pause();});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&game.mode==="play")UI.pause();});
$("start").onclick=()=>game.start();
document.querySelector('[data-open="controls"]').onclick=()=>UI.controls("title");
$("close").onclick=()=>UI.close();
$("panelBody").onclick=e=>{const btn=e.target.closest("[data-action]");if(btn)UI.action(btn.dataset.action);};
$("openMap").onclick=()=>UI.map();
$("pauseIcon").onclick=()=>UI.pause();
let pointer=null;
$("world").onpointerdown=e=>{
    if(game.mode!=="play")return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
    $("world").setPointerCapture(e.pointerId);
};
$("world").onpointermove=e=>{
    if(!pointer||pointer.id!==e.pointerId||game.mode!=="play")return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    pointer.x=e.clientX;pointer.y=e.clientY;
    if(game.car){game.orbit-=dx*.009;game.orbitHold=2.3;}else game.cam.yaw-=dx*.009;
    game.lookPitch=clamp(game.lookPitch+dy*.017,-1.1,2.5);
};
$("world").onlostpointercapture=()=>{pointer=null;};
for(const button of document.querySelectorAll("[data-key]")){
    button.onpointerdown=e=>{
        e.preventDefault();button.setPointerCapture(e.pointerId);
        if(game.mode==="play"){keys.add(button.dataset.key);gameKey(button.dataset.key);}
    };
    button.onlostpointercapture=()=>keys.delete(button.dataset.key);
}
let previous=0;
function frame(now){
    requestAnimationFrame(frame);
    const delta=previous?(now-previous)/1000:1/60;previous=now;
    if(game.mode!=="play")return;
    Render.sampleFrame(delta);
    const dt=Math.min(.10,delta);
    const orbitDirection=Number(keys.has("KeyZ"))-Number(keys.has("KeyX"));
    if(orbitDirection){
        if(game.car){game.orbit+=orbitDirection*2.3*dt;game.orbitHold=1.8;}
        else game.cam.yaw+=orbitDirection*2.3*dt;
    }
    const steps=Math.max(1,Math.ceil(dt*60));
    for(let i=0;i<steps&&game.mode==="play";i++)game.tick(dt/steps);
    if(game.mode==="play")AudioMix.update(game.car?.speed||0,!!game.car,keys.has("KeyW"),game.heat);
    Render.draw(game.cam,game.actors(),game.elapsed);
}
async function launch(){
    try{
        Render.quality=save.quality;AudioMix.station=save.radio;AudioMix.muted=save.muted;
        await Render.init($("world"));game.populate();
        game.ready=true;$("start").disabled=false;
        $("start").innerHTML=(save.job>0?"Return to Liberty City":"Enter Liberty City")+' <span class="arrow">→</span>';
        requestAnimationFrame(frame);
    }catch(error){
        $("start").textContent="City unavailable";$("loadMessage").textContent=error.message;
    }
}
$("world").addEventListener("webglcontextlost",e=>{
    e.preventDefault();game.mode="lost";game.ready=false;AudioMix.pause();keys.clear();
    $("veil").hidden=true;$("hud").hidden=true;$("title").hidden=false;
    $("start").disabled=true;$("start").textContent="Graphics interrupted";
    $("loadMessage").textContent="Reload the page to restore the city. Completed sides are saved.";
});
launch();
