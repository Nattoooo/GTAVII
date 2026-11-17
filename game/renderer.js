// A single packed vertex buffer holds all static sectors and vehicle/character meshes.
"use strict";

const WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec2 texcoord;
layout(location=2) in vec3 tint;
layout(location=3) in float material;
layout(location=4) in float paint;
layout(location=5) in vec4 transform;
layout(location=6) in vec4 livery;
layout(location=7) in float glow;
uniform vec3 eye, rightAxis, upAxis, forwardAxis;
uniform vec2 focal;
uniform float time, walk;
out vec2 uv;
out vec3 color, world;
out float fog, emission;
flat out int layer;
void main(){
    vec3 p=position/16.;
    float stride=sin(time*8.+transform.x*.5)*walk*livery.a;
    if (p.y<.8) p.z+=stride*sign(p.x)*(.8-p.y)*.42;
    else if (abs(p.x)>.25) p.z-=stride*sign(p.x)*max(0.,1.38-p.y)*.54;
    float s=sin(transform.w), c=cos(transform.w);
    world=vec3(p.x*c+p.z*s,p.y,p.z*c-p.x*s)+transform.xyz;
    vec3 d=world-eye;
    float depth=dot(d,forwardAxis);
    gl_Position=vec4(dot(d,rightAxis)*focal.x,dot(d,upAxis)*focal.y,depth*1.00023-.321,depth);
    uv=texcoord/64.; layer=int(material+.5);
    emission=glow;
    color=tint*mix(vec3(1.),livery.rgb,paint);
    fog=clamp((length(d.xz)-35.)/740.,0.,.92);
}`;
const WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec2 uv;
in vec3 color,world;
in float fog, emission;
flat in int layer;
uniform sampler2DArray atlas;
uniform sampler2D shadows;
uniform vec3 eye;
uniform vec4 headlight;
uniform float time, night;
out vec4 outputColor;
void main(){
    vec3 col;
    if(layer==1){
        vec2 p=uv*vec2(.33,1.9);
        float textureWave=texture(atlas,vec3(p+vec2(time*.012,time*.021),1.)).r;
        vec3 v=normalize(world-eye);
        float gleam=pow(max(0.,dot(normalize(v.xz),normalize(vec2(-.96,-.20)))),16.);
        float r=sin(world.z*2.4+world.x*.39+time*1.3)+sin(world.z*4.7-time*.85);
        col=mix(vec3(.32,.39,.46),vec3(.76,.58,.53),textureWave*.72+gleam*.26);
        col+=gleam*smoothstep(.78,1.75,r)*vec3(.31,.18,.08);
        col=mix(col,col*vec3(.20,.29,.43)+vec3(.012,.022,.042),night);
        col+=night*gleam*smoothstep(.9,1.8,r)*vec3(.14,.09,.15);
    } else {
        vec4 surface=texture(atlas,vec3(uv,float(layer)));
        col=color*surface.rgb;
        float shadow=texture(shadows,world.xz/1200.+.5).r;
        col*=mix(vec3(.67,.70,.79),vec3(1.),mix(smoothstep(.62,1.,shadow),1.,smoothstep(1.2,5.,world.y)));
        vec3 afterDark=col*vec3(.32,.37,.53)+vec3(.015,.018,.042);
        afterDark+=surface.a*vec3(.89,.58,.32)+emission*col*1.5;
        col=mix(col,afterDark,night);
        if(world.y<3. && night>.02){
            vec2 delta=world.xz-headlight.xy;
            float along=max(0.,dot(delta,headlight.zw)), across=abs(dot(delta,vec2(-headlight.w,headlight.z)));
            float beam=smoothstep(1.4,3.1,along)*(1.-smoothstep(4.,23.,along))*(1.-smoothstep(.3+along*.10,1.6+along*.17,across));
            col+=night*beam*vec3(.34,.25,.13);
        }
    }
    vec3 haze=mix(vec3(.81,.67,.67),vec3(.19,.19,.30),night);
    col=mix(col,haze,fog*fog*(2.-fog));
    outputColor=vec4(col,1.);
}`;
const SKY_VS = `#version 300 es
out vec2 coord;
void main(){
    coord=vec2((gl_VertexID<<1)&2,gl_VertexID&2)*2.-1.;
    gl_Position=vec4(coord,1.,1.);
}`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 coord;
uniform vec3 rightAxis,upAxis,forwardAxis;
uniform vec2 focal;
uniform float time, night;
out vec4 outputColor;
void main(){
    vec3 ray=normalize(forwardAxis+rightAxis*coord.x/focal.x+upAxis*coord.y/focal.y);
    float h=max(0.,ray.y);
    vec3 sun=normalize(vec3(-.96,.145-night*.33,-.20));
    float facing=max(0.,dot(sun,ray));
    vec3 low=mix(vec3(.86,.69,.72),vec3(1.,.74,.52),pow(facing,5.));
    vec3 sky=mix(low,vec3(.32,.46,.65),1.-exp(-h*2.6));
    sky+=vec3(.18,.08,.025)*pow(facing,34.);
    float disc=smoothstep(.9989,.99915,facing);
    sky=mix(sky,vec3(1.,.90,.64),disc);
    vec2 q=ray.xz/max(.035,h+.05);
    float ribbon=sin(q.y*13.+2.*sin(q.x*.56)+time*.014)+.6*sin(q.y*21.+q.x*.41);
    float cloud=smoothstep(.78,1.52,ribbon)*smoothstep(.015,.12,h)*(1.-smoothstep(.35,.7,h));
    sky=mix(sky,mix(vec3(.81,.72,.76),vec3(1.,.80,.62),facing),cloud*.36);
    vec3 dim=mix(vec3(.32,.25,.36),vec3(.055,.085,.17),smoothstep(0.,.74,h));
    vec3 moon=normalize(vec3(.36,.39,-.82));
    float moonlight=smoothstep(.9995,.9997,dot(ray,moon));
    vec2 cell=ray.xz/max(.09,h)*112.;
    float star=step(.992,fract(sin(dot(floor(cell),vec2(23.7,78.9)))*4271.3))*(1.-smoothstep(.07,.23,length(fract(cell)-.5)));
    dim+=moonlight*vec3(.69,.69,.59)+star*smoothstep(.06,.4,h)*.58;
    sky=mix(sky,dim,night);
    outputColor=vec4(sky,1.);
}`;

function shaderProgram(gl, vertex, fragment) {
    const program = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
        return shader;
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    for (const shader of shaders) gl.deleteShader(shader);
    const uniforms = {};
    for (const name of ["eye","rightAxis","upAxis","forwardAxis","focal","time","walk","atlas","shadows","night","headlight"])
        uniforms[name] = gl.getUniformLocation(program, name);
    return { program, uniforms };
}

function loadBitmap(url) {
    const img = new Image();
    img.src = url;
    return img.decode().then(() => img);
}

async function unpack(encoded) {
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
}

const Render = {
    quality: "auto", scale: .86, fps: 0, slow: 0, fast: 0, elapsed: 0, frames: 0,
    async init(canvas) {
        const gl = canvas.getContext("webgl2", { alpha:false, antialias:false, depth:true, powerPreference:"low-power" });
        if (!gl) throw new Error("This game needs WebGL 2. Enable hardware acceleration or open it in a current desktop browser.");
        this.gl = gl;
        this.canvas = canvas;
        this.city = shaderProgram(gl, WORLD_VS, WORLD_FS);
        this.sky = shaderProgram(gl, SKY_VS, SKY_FS);
        const [vertices, atlas, shadow] = await Promise.all([unpack(CITY.geometry), unpack(CITY.atlas), loadBitmap(CITY.shadow)]);
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,CITY.tileSize,CITY.tileSize,CITY.layers,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(atlas));
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        const light = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,light);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,shadow);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        this.vbo=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
        this.instanceBuffer=gl.createBuffer();
        this.instanceData=new Float32Array(8*160);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,this.instanceData.byteLength,gl.DYNAMIC_DRAW);
        this.staticVao=this.makeVao(false);
        this.actorVao=this.makeVao(true);
        this.skyVao=gl.createVertexArray();
        gl.useProgram(this.city.program);
        gl.uniform1i(this.city.uniforms.atlas,0);
        gl.uniform1i(this.city.uniforms.shadows,1);
        this.groups={};
        for(const name of Object.keys(CITY.models)) this.groups[name]=[];
        gl.clearColor(.85,.7,.72,1);
    },
    makeVao(instanced) {
        const gl=this.gl, vao=gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
        for(const [index,size,type,normalize,offset] of [[0,3,gl.SHORT,false,0],[1,2,gl.SHORT,false,6],[2,3,gl.UNSIGNED_BYTE,true,10],[3,1,gl.UNSIGNED_BYTE,false,13],[4,1,gl.UNSIGNED_BYTE,false,14],[7,1,gl.UNSIGNED_BYTE,true,15]]){
            gl.enableVertexAttribArray(index);
            gl.vertexAttribPointer(index,size,type,normalize,16,offset);
        }
        if(instanced){
            gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);
            for(const index of [5,6]){
                gl.enableVertexAttribArray(index);
                gl.vertexAttribPointer(index,4,gl.FLOAT,false,32,(index-5)*16);
                gl.vertexAttribDivisor(index,1);
            }
        }
        gl.bindVertexArray(null);
        return vao;
    },
    sampleFrame(dt) {
        this.frames++;
        this.elapsed+=dt;
        if(this.elapsed<1) return;
        this.fps=Math.round(this.frames/this.elapsed);
        this.elapsed=0;
        this.frames=0;
        if(this.quality!=="auto") return;
        this.slow=this.fps<55?this.slow+1:0;
        this.fast=this.fps>=59?this.fast+1:0;
        if(this.slow>=2){ this.scale=Math.max(.45,this.scale-.09); this.slow=0; }
        if(this.fast>=7){ this.scale=Math.min(1,this.scale+.04); this.fast=0; }
    },
    view(program,cam,fx,fy,time) {
        const gl=this.gl, u=program.uniforms;
        gl.useProgram(program.program);
        gl.uniform3f(u.eye,cam.x,cam.y,cam.z);
        gl.uniform3fv(u.rightAxis,cam.right);
        gl.uniform3fv(u.upAxis,cam.up);
        gl.uniform3fv(u.forwardAxis,cam.forward);
        gl.uniform2f(u.focal,fx,fy);
        gl.uniform1f(u.time,time);
        const night=save.light==="midnight"?1:save.light==="sunset"?0:(1-Math.cos(time*Math.PI/184))*.5;
        gl.uniform1f(u.night,night);
        const car=game.car;
        if(car)gl.uniform4f(u.headlight,car.x,car.z,Math.sin(car.a),Math.cos(car.a));
        else gl.uniform4f(u.headlight,9999,9999,1,0);
    },
    draw(cam,actors,time) {
        const gl=this.gl, canvas=this.canvas;
        const scale=this.quality==="low"?.57:this.quality==="high"?1:this.scale;
        const factor=Math.min(scale,(this.quality==="low"?750:1440)/canvas.clientWidth,(this.quality==="low"?460:900)/canvas.clientHeight);
        const w=Math.max(2,Math.round(canvas.clientWidth*factor)),h=Math.max(2,Math.round(canvas.clientHeight*factor));
        if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
        gl.viewport(0,0,w,h);
        const fy=1/Math.tan(cam.fov/2),fx=fy*h/w;
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        this.view(this.city,cam,fx,fy,time);
        gl.bindVertexArray(this.staticVao);
        gl.vertexAttrib4f(5,0,0,0,0);
        gl.vertexAttrib4f(6,1,1,1,0);
        const reach=scale<.65?470:760;
        for(const [x,z,start,count] of CITY.chunks){
            const dx=x-cam.x,dz=z-cam.z;
            const depth=dx*cam.forward[0]+dz*cam.forward[2];
            if(depth < -105 || dx*dx+dz*dz>(reach+100)**2) continue;
            if(Math.abs(dx*cam.right[0]+dz*cam.right[2])>Math.max(0,depth)/fx+153) continue;
            gl.drawArrays(gl.TRIANGLES,start,count);
        }
        gl.bindVertexArray(this.actorVao);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);
        for(const group of Object.values(this.groups)) group.length=0;
        for(const actor of actors){
            const dx=actor.x-cam.x,dz=actor.z-cam.z;
            if(dx*dx+dz*dz>220*220 || dx*cam.forward[0]+dz*cam.forward[2]<-8) continue;
            this.groups[actor.model].push(actor);
        }
        for(const [name,group] of Object.entries(this.groups)){
            if(!group.length) continue;
            let i=0;
            for(const a of group){
                this.instanceData[i++]=a.x; this.instanceData[i++]=a.y||0; this.instanceData[i++]=a.z; this.instanceData[i++]=a.a||0;
                const col=a.color||WHITE;
                this.instanceData[i++]=col[0]; this.instanceData[i++]=col[1]; this.instanceData[i++]=col[2]; this.instanceData[i++]=a.stride||0;
            }
            gl.bufferSubData(gl.ARRAY_BUFFER,0,this.instanceData,0,i);
            gl.uniform1f(this.city.uniforms.walk,name==="person"?1:0);
            const [start,count]=CITY.models[name];
            gl.drawArraysInstanced(gl.TRIANGLES,start,count,group.length);
        }
        gl.uniform1f(this.city.uniforms.walk,0);
        gl.bindVertexArray(this.staticVao);
        gl.vertexAttrib4f(5,0,0,0,0);
        gl.vertexAttrib4f(6,1,1,1,0);
        const water=CITY.models.water;
        gl.drawArrays(gl.TRIANGLES,water[0],water[1]);
        this.view(this.sky,cam,fx,fy,time);
        gl.bindVertexArray(this.skyVao);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindVertexArray(null);
    }
};
