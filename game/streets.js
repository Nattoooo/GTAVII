"use strict";

const WHITE=[1,1,1];
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const mix=(a,b,t)=>a+(b-a)*t;
const angleDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nodes=CITY.nodes.map(([x,z],id)=>({x,z,id,links:[]}));
const roads=CITY.roads.map(([i,j,bridge])=>{
    const a=nodes[i],b=nodes[j],length=gap(a,b);
    a.links.push({id:j,length});
    b.links.push({id:i,length});
    return {a,b,length,bridge};
});
const bridgeRoads=roads.filter(r=>r.bridge);
const solidCells=new Map();
function cellKey(x,z){return Math.floor(x/36)+","+Math.floor(z/36);}
for(const box of CITY.solids){
    for(let x=Math.floor((box[0]-4)/36);x<=Math.floor((box[2]+4)/36);x++){
        for(let z=Math.floor((box[1]-4)/36);z<=Math.floor((box[3]+4)/36);z++){
            const key=x+","+z;
            if(!solidCells.has(key)) solidCells.set(key,[]);
            solidCells.get(key).push(box);
        }
    }
}
function buildingAt(x,z,r=0,y=0){
    const cell=solidCells.get(cellKey(x,z));
    if(!cell) return false;
    return cell.some(b=>x>b[0]-r&&x<b[2]+r&&z>b[1]-r&&z<b[3]+r&&y<b[4]+.4);
}
function pavementHeight(x,z){
    return CITY.blocks.some(b=>x>=b[0]&&z>=b[1]&&x<=b[2]&&z<=b[3]) ? .26 : .07;
}
function landAt(x,z,r=0){
    return CITY.land.find(b=>x>b[0]+r&&x<b[2]-r&&z>b[1]+r&&z<b[3]-r);
}
function passable(x,z,r){
    if(!landAt(x,z,r)&&!bridgeRoads.some(b=>x>=b.a.x-1&&x<=b.b.x+1&&Math.abs(z-b.a.z)<7.7-r)) return false;
    return !buildingAt(x,z,r);
}
function districtAt(x,z){
    return landAt(x,z)?.[4] || (x>0?"East Borough Bridge":"West River Bridge");
}
function snapRoad(point){
    let best=null,dist=Infinity;
    for(const road of roads){
        const {a,b,length}=road;
        const t=clamp(((point.x-a.x)*(b.x-a.x)+(point.z-a.z)*(b.z-a.z))/(length*length),0,1);
        const x=mix(a.x,b.x,t),z=mix(a.z,b.z,t);
        const d=(x-point.x)**2+(z-point.z)**2;
        if(d<dist){best={x,z,t,road};dist=d;}
    }
    return best;
}
function shortestPath(source,dest){
    if(source===dest) return [source];
    const dist=new Float64Array(nodes.length).fill(Infinity),prev=new Int16Array(nodes.length).fill(-1);
    const pending=new Set([source]);
    dist[source]=0;
    while(pending.size){
        let cur=-1;
        for(const i of pending) if(cur<0||dist[i]<dist[cur]) cur=i;
        if(cur===dest) break;
        pending.delete(cur);
        for(const link of nodes[cur].links){
            const d=dist[cur]+link.length;
            if(d>=dist[link.id]) continue;
            dist[link.id]=d;prev[link.id]=cur;pending.add(link.id);
        }
    }
    if(prev[dest]<0) return [];
    const path=[];
    for(let i=dest;i!==-1;i=prev[i]) path.push(i);
    return path.reverse();
}
function streetRoute(origin,target){
    if(!target) return [];
    const a=snapRoad(origin),b=snapRoad(target);
    if(a.road===b.road) return [origin,a,b,target];
    let best=[],length=Infinity;
    for(const start of [a.road.a,a.road.b]){
        for(const end of [b.road.a,b.road.b]){
            const ids=shortestPath(start.id,end.id);
            if(!ids.length) continue;
            const path=[a,...ids.map(id=>nodes[id]),b];
            let d=0;
            for(let i=1;i<path.length;i++) d+=gap(path[i-1],path[i]);
            if(d<length){length=d;best=path;}
        }
    }
    return [origin,...best,target];
}
function lanePosition(car){
    const a=nodes[car.from],b=nodes[car.to];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const t=car.travel/len;
    const lane=Math.min(1,t*8,(1-t)*8)*2.8;
    car.x=mix(a.x,b.x,t)-dz/len*lane;
    car.z=mix(a.z,b.z,t)+dx/len*lane;
    car.a=Math.atan2(dx,dz);
}
function moveTraffic(car,dt,next){
    car.travel+=car.cruise*dt;
    let length=gap(nodes[car.from],nodes[car.to]);
    while(car.travel>=length){
        car.travel-=length;
        const from=car.from;
        car.from=car.to;
        car.to=next(car.from,from);
        length=gap(nodes[car.from],nodes[car.to]);
    }
    lanePosition(car);
}
function nextTraffic(from,previous){
    const options=nodes[from].links.filter(link=>link.id!==previous);
    return options.length?options[Math.floor(Math.random()*options.length)].id:previous;
}

const VEHICLES=[
    {model:"coupe",name:"Serrano GT",top:45,accel:14,turn:1.76},
    {model:"sedan",name:"Belmont LX",top:37,accel:11.8,turn:1.64},
    {model:"taxi",name:"Liberty Cab",top:36,accel:11.4,turn:1.75},
    {model:"van",name:"Crown Panel Van",top:30,accel:8.8,turn:1.39}
];
const PAINTS=[[.64,.16,.22],[.20,.42,.48],[.85,.67,.47],[.41,.41,.59],[.85,.83,.73],[.27,.33,.37]];
const COATS=[[.72,.31,.19],[.34,.52,.57],[.53,.45,.63],[.42,.49,.31],[.72,.58,.44]];
const TAXI=[1,.73,.21];
const JOBS=[
    {name:"The last pressing",fee:400,voice:"Mina",intro:"They sold the building. They forgot about the records. Get our last acetate across the river.",
     stages:[
        ["drive",72,88,"Park outside Crown Records in Algonquin."],
        ["foot",62.5,88,"Pick up Mina’s acetate on foot."],
        ["drive",288,106,"Deliver the acetate to Crown FM in Broker."]]},
    {name:"Needle run",fee:700,voice:"Sol",intro:"The pressing plant has one slot left. I marked the fastest cut across town. Make the lights.",
     limit:88,stages:[
        ["drive",360,144,"Meet Sol at the Broker starting line."],
        ["gate",360,18,"Run north up the avenue."],["gate",288,-72,"Take the north bridge."],
        ["gate",144,-72,"Cross into Algonquin."],["gate",72,0,"Turn through Middle Park."],
        ["gate",0,72,"Finish at the pressing plant."]]},
    {name:"Dead air",fee:1000,voice:"Mina",intro:"Our transmitter is sitting in an Alderney freight yard. Bring it back before the station goes dark.",
     stages:[
        ["drive",-288,-72,"Meet the freight crew in Alderney."],
        ["foot",-278.5,-55,"Collect the transmitter on foot."],
        ["escape",-288,-72,"Get in a car and lose the patrol."],
        ["drive",-72,-137,"Deliver the transmitter to the relay station."]]},
    {name:"Sign on",fee:1400,voice:"Sol",intro:"Three boroughs, one frequency. Tune the relays and bring us on air from the waterfront.",
     stages:[
        ["tune",-360,72,"Tune the Alderney relay."],["tune",72,-144,"Tune the Algonquin relay."],
        ["tune",360,0,"Tune the Broker relay."],["drive",144,216,"Take the master tape to the ferry terminal."]]}
];
const SAVE_KEY="gtavii.afterhours.1";
function readSave(){
    let stored;
    try{stored=JSON.parse(localStorage.getItem(SAVE_KEY)||"{}");}catch{stored={};}
    if(!stored||typeof stored!=="object") stored={};
    const finite=(v,base)=>Number.isFinite(v)?v:base;
    return {job:clamp(Math.trunc(finite(stored.job,0)),0,JOBS.length),cash:Math.max(0,Math.floor(finite(stored.cash,0))),
        records:Array.isArray(stored.records)?[...new Set(stored.records.filter(i=>Number.isInteger(i)&&i>=0&&i<CITY.records.length))]:[],
        best:Math.max(0,finite(stored.best,0)),paint:clamp(Math.trunc(finite(stored.paint,0)),0,PAINTS.length-1),
        quality:["auto","low","high"].includes(stored.quality)?stored.quality:"auto",radio:[0,1,2].includes(stored.radio)?stored.radio:1,
        light:["cycle","sunset","midnight"].includes(stored.light)?stored.light:"cycle",muted:stored.muted===true};
}
