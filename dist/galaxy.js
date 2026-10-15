/* Original procedural galaxy renderer for Stellar Echo.
   Uses point sprites and independent spiral distributions; no external runtime. */
(function(){
'use strict';
const TAU=Math.PI*2, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function generator(seed){let s=seed>>>0;return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
const random=generator(20261015);
const normal=()=>Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(TAU*random());
const anchorPolar=[[3.45,2.57],[3.76,.31],[2.84,4.18],[3.5,5.52],[4.1,3.56],[3.5,1.40]];
const anchorXYZ=anchorPolar.map(([r,a],i)=>[Math.cos(a)*r,.08+(i%2)*.12,Math.sin(a)*r]);
const themes=[[1,.54,.76],[.62,.70,1],[.72,.42,1],[.40,.86,1],[.46,.52,.65],[.53,.58,.56]];
const NEAR=.35,MIN_DISTANCE=4.5,MAX_DISTANCE=28;
const normalizeQ=q=>{const n=Math.hypot(...q);if(n<1e-12)return[0,0,0,1];return Math.abs(n-1)<1e-12?q.slice():q.map(v=>v/n);};
const multiplyQ=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const axisQ=(x,y,z,angle)=>{const n=Math.hypot(x,y,z);if(n<1e-12)return[0,0,0,1];const s=Math.sin(angle/2)/n;return[x*s,y*s,z*s,Math.cos(angle/2)];};
const cameraQ=(yaw,pitch)=>normalizeQ(multiplyQ(axisQ(1,0,0,pitch),axisQ(0,1,0,yaw)));
function fromToQ(a,b){const na=Math.hypot(...a),nb=Math.hypot(...b);if(na<1e-12||nb<1e-12)return[0,0,0,1];a=a.map(v=>v/na);b=b.map(v=>v/nb);const dot=clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1);if(dot<-.999999){const helper=Math.abs(a[0])<.8?[1,0,0]:[0,1,0];return axisQ(a[1]*helper[2]-a[2]*helper[1],a[2]*helper[0]-a[0]*helper[2],a[0]*helper[1]-a[1]*helper[0],Math.PI);}return normalizeQ([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],1+dot]);}
function slerpQ(a,b,t){let dot=a.reduce((sum,v,i)=>sum+v*b[i],0);if(dot<0){b=b.map(v=>-v);dot=-dot;}if(dot>.9995)return normalizeQ(a.map((v,i)=>v+(b[i]-v)*t));const angle=Math.acos(clamp(dot,-1,1)),den=Math.sin(angle),x=Math.sin((1-t)*angle)/den,y=Math.sin(t*angle)/den;return normalizeQ(a.map((v,i)=>v*x+b[i]*y));}
class StellarGalaxy{
 constructor(canvas,stage,{onPose,onDragEnd,onZoom,onAutoChange,onFallback}={}){
  this.canvas=canvas;this.stage=stage;this.onPose=onPose;this.onDragEnd=onDragEnd;this.onZoom=onZoom;this.onAutoChange=onAutoChange;this.onFallback=onFallback;
  this.yaw=.28;this.pitch=.71;this._orientation=cameraQ(this.yaw,this.pitch);this._targetOrientation=this._orientation.slice();this._matrix=new Float32Array(9);this._matrixDirty=true;this._distance=10.5;this._targetLogDistance=Math.log(this._distance);this.ignition=1;this.flat=false;this.active=true;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.auto=!this.reduced;this.pointers=new Map();this._captures=new Set();this._angularVelocity=[0,0,0];this._drag=null;this._gestureMoved=false;this._pinchSpan=0;this._pinchDirect=false;this._focus=null;this._dirty=true;this._poseDirty=true;this._lastZoom=null;this.last=null;this._lastDraw=-Infinity;this.width=1;this.height=1;this.quality=11000;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power',premultipliedAlpha:true});if(!gl)throw new Error('WebGL unavailable');this.gl=gl;
  const vert=`attribute vec3 aPosition;attribute vec4 aColor;attribute float aSize;attribute float aGroup;uniform vec2 uResolution;uniform mat3 uRotationMatrix;uniform float uDistance;uniform float uScale;uniform float uPixelRatio;uniform mediump float uHalo;uniform float uTime;uniform float uIntensity;uniform float uIgnition;varying mediump vec4 vColor;void main(){vec3 p=uRotationMatrix*aPosition;float depth=uDistance-p.z;if(depth<=.35){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vColor=vec4(0.);return;}float k=10.5/depth;gl_Position=vec4(p.x*uScale*k*2.0/uResolution.x,p.y*uScale*k*2.0/uResolution.y,0.,1.);float phase=aGroup>.5?clamp((uIgnition-(aGroup-1.)*.18)/.32,0.,1.):1.;float glow=mix(.05,1.,smoothstep(0.,1.,phase));float pulse=sin(phase*3.14159265);gl_PointSize=clamp(aSize*k*uPixelRatio*uHalo*(1.+pulse*.28),.8,96.);float twinkle=.88+.12*sin(uTime*.65+aPosition.x*5.+aPosition.z*9.);vColor=vec4(aColor.rgb*(1.+pulse*.35),aColor.a*twinkle*uIntensity*glow);}`;
  const frag=`precision mediump float;varying mediump vec4 vColor;uniform mediump float uHalo;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv)*2.;if(d>1.)discard;float light=exp(-d*d*(uHalo>1.5?4.5:6.5));float core=pow(max(0.,1.-d),5.);float alpha=vColor.a*(uHalo>1.5?.055:1.)*light;gl_FragColor=vec4(vColor.rgb*(1.+core*.4),alpha);}`;
  const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error('Galaxy shader unavailable: '+info);}return sh;};
  const vs=compile(gl.VERTEX_SHADER,vert),fs=compile(gl.FRAGMENT_SHADER,frag);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Galaxy program unavailable: '+gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.uniforms={};['Resolution','RotationMatrix','Distance','Scale','PixelRatio','Halo','Time','Intensity','Ignition'].forEach(n=>this.uniforms[n]=gl.getUniformLocation(this.program,'u'+n));
  this.buildCloud();gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  this.resize();this.bindInput();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.setActive(false);cancelAnimationFrame(this.raf);this.onFallback?.();});
 }
 buildCloud(){
  const positions=[],colors=[],sizes=[],groups=[];
  const add=(x,y,z,c,a,size,group=0)=>{positions.push(x,y,z);colors.push(...c,a);sizes.push(size);groups.push(group);};
  // A four-arm disk with a central spheroid, varying arm widths and loose inter-arm stars.
  for(let i=0;i<this.quality;i++){
   const bulge=random()<.12;
   if(bulge){const r=Math.abs(normal())*.52,a=random()*TAU;add(Math.cos(a)*r,normal()*.15,Math.sin(a)*r,[1,.78+random()*.14,.57+random()*.25],.31+random()*.4,1.15+random()*2.15);continue;}
   const r=.2+Math.sqrt(random())*4.25,arm=Math.floor(random()*4),loose=random()<.18;
   const angle=arm*TAU/4+1.55*Math.log(1+r*1.9)+(loose?random()*TAU:normal()*(.10+.12/r));
   const edge=r/4.45;const density=.38+random()*.42;
   let color=[.65+(.23*(1-edge)),.65+random()*.20,1];if(random()<.1)color=[1,.45+random()*.22,.66+random()*.15];if(edge<.35)color=[1,.79,.65];
   const jitter=normal()*.08;add(Math.cos(angle)*(r+jitter),normal()*(.025+.10*(1-edge)),Math.sin(angle)*(r+jitter),color,density*(loose?.45:1),.65+random()*1.7);
  }
  // Soft star-forming knots: independently placed luminous clusters along the arms.
  for(let cluster=0;cluster<28;cluster++){
   const r=1+random()*3.3,a=(cluster%4)*TAU/4+1.55*Math.log(1+r*1.9),cx=Math.cos(a)*r,cz=Math.sin(a)*r,c=cluster%3===0?[1,.34,.58]:[.44,.67,1];
   for(let j=0;j<32;j++)add(cx+normal()*.10,normal()*.045,cz+normal()*.1,c,.24+random()*.25,1+random()*2.6);
  }
  // Each genre is a small satellite galaxy with its own luminous centre and spiral.
  anchorXYZ.forEach((p,i)=>{const lit=i<4;for(let j=0;j<(lit?620:150);j++){const r=Math.pow(random(),.75)*(lit?.68:.25),a=(j%2)*Math.PI+Math.sqrt(r)*9+normal()*.15;const c=themes[i];add(p[0]+Math.cos(a)*r,p[1]+normal()*.018,p[2]+Math.sin(a)*r,c,lit?.40:.13,.7+random()*1.6,lit?i+1:0);}add(p[0],p[1],p[2],themes[i],lit?.9:.3,lit?22:8,lit?i+1:0);});
  // Sparse near and far stars provide parallax without washing out the sky.
  for(let i=0;i<300;i++){const a=random()*TAU,r=3+random()*5;add(Math.cos(a)*r,normal()*2.2,Math.sin(a)*r,[.64+random()*.3,.72+random()*.25,1],.2+random()*.5,.6+random()*2.6);}
  add(0,0,0,[1,.85,.66],.45,24);add(0,0,0,[1,.64,.57],.16,60);
  const gl=this.gl;this.count=sizes.length;
  [['aPosition',positions,3],['aColor',colors,4],['aSize',sizes,1],['aGroup',groups,1]].forEach(([name,data,n])=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0);});
 }
 get distance(){return this._distance;}
 set distance(value){
  if(!Number.isFinite(value))return;
  this._focus=null;
  this._assignDistance(value);
  this._targetLogDistance=Math.log(this._distance);
  this._pinchDirect=false;
 }
 _assignDistance(value){const next=clamp(value,MIN_DISTANCE,MAX_DISTANCE);if(Math.abs(next-this._distance)<1e-10)return;this._distance=next;this._dirty=this._poseDirty=true;}
 _setOrientation(value){
  const q=normalizeQ(value);
  if(q.every((v,i)=>Math.abs(v-this._orientation[i])<1e-12))return;
  this._orientation=q;this._matrixDirty=true;this._dirty=this._poseDirty=true;
 }
 _updateMatrix(){
  if(!this._matrixDirty)return;
  const [x,y,z,w]=this._orientation,m=this._matrix;
  // Column-major values are shared by GLSL and the DOM beacon projection.
  m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+z*w);m[2]=2*(x*z-y*w);
  m[3]=2*(x*y-z*w);m[4]=1-2*(x*x+z*z);m[5]=2*(y*z+x*w);
  m[6]=2*(x*z+y*w);m[7]=2*(y*z-x*w);m[8]=1-2*(x*x+y*y);
  this._matrixDirty=false;
 }
 _transform(p){this._updateMatrix();const m=this._matrix;return[m[0]*p[0]+m[3]*p[1]+m[6]*p[2],m[1]*p[0]+m[4]*p[1]+m[7]*p[2],m[2]*p[0]+m[5]*p[1]+m[8]*p[2]];}
 resize(){
  this.width=this.stage.clientWidth;this.height=this.stage.clientHeight;
  this.dpr=Math.min(devicePixelRatio||1,this.width<=540?1.25:1.5);
  this.canvas.width=Math.max(1,Math.round(this.width*this.dpr));this.canvas.height=Math.max(1,Math.round(this.height*this.dpr));
  this.scale=Math.min(this.width/10.6,this.height/6.5);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  this._dirty=this._poseDirty=true;
 }
 project(index){
  const anchor=anchorXYZ[index];
  if(!anchor||!this.width||!this.height)return{x:50,y:50,depth:0,scale:1,visible:false};
  const [xx,yy,z]=this._transform(anchor),depth=this._distance-z,k=10.5/Math.max(NEAR,depth);
  const x=(.5+xx*this.scale*k/this.width)*100,y=(.5-yy*this.scale*k/this.height)*100;
  return{x,y,depth:z,scale:clamp(k,.75,1.25),visible:depth>NEAR&&x>=0&&x<=100&&y>=0&&y<=100};
 }
 ignitionAt(index){if(index>3)return 1;return clamp((this.ignition-index*.18)/.32,0,1);}
 setIgnition(value){const next=clamp(value,0,1);if(next===this.ignition)return;this.ignition=next;this._dirty=this._poseDirty=true;}
 getPose(){return{orientation:this._orientation.slice(),distance:this._distance,auto:this.auto};}
 setPose(pose){
  if(!pose||!pose.orientation||pose.orientation.length!==4||!Array.from(pose.orientation).every(Number.isFinite))return;
  this._clearInput(false);this._cancelMotion();
  this._setOrientation(Array.from(pose.orientation));this._targetOrientation=this._orientation.slice();
  if(Number.isFinite(pose.distance))this.distance=pose.distance;
  this._targetLogDistance=Math.log(this._distance);
  if(typeof pose.auto==='boolean')this.setAuto(pose.auto);
  this._dirty=this._poseDirty=true;
 }
 setCamera(yaw,pitch){
  if(!Number.isFinite(yaw)||!Number.isFinite(pitch))return;
  this._cancelMotion();this.yaw=yaw;this.pitch=pitch;
  this._setOrientation(cameraQ(yaw,pitch));this._targetOrientation=this._orientation.slice();
 }
 setFlat(flat){this.flat=Boolean(flat);this._clearInput(true);this._cancelMotion();this._dirty=this._poseDirty=true;}
 setActive(active){
  this.active=Boolean(active);this.last=null;
  if(!active){this._clearInput(true);this._cancelMotion();}
  else this._dirty=this._poseDirty=true;
 }
 setAuto(on){const value=Boolean(on);this._angularVelocity=[0,0,0];if(this.auto===value)return;this.auto=value;this.onAutoChange?.(value);}
 _cancelFocus(){if(!this._focus)return;this._focus=null;this._targetOrientation=this._orientation.slice();this._targetLogDistance=Math.log(this._distance);}
 _cancelMotion(){this._focus=null;this._angularVelocity=[0,0,0];this._targetOrientation=this._orientation.slice();this._targetLogDistance=Math.log(this._distance);this._pinchDirect=false;}
 zoomBy(factor){
  if(!Number.isFinite(factor)||factor<=0)return;
  this._cancelFocus();this.setAuto(false);
  this._targetLogDistance=clamp(this._targetLogDistance+Math.log(factor),Math.log(MIN_DISTANCE),Math.log(MAX_DISTANCE));
  this._dirty=true;
 }
 reset(){
  this._clearInput(true);this._cancelMotion();this.yaw=.28;this.pitch=.71;
  this._setOrientation(cameraQ(this.yaw,this.pitch));this._targetOrientation=this._orientation.slice();this.distance=10.5;
  this._dirty=this._poseDirty=true;
 }
 focus(index){
  const anchor=anchorXYZ[index];if(!anchor)return;
  this._clearInput(false);this._cancelMotion();this.setAuto(false);
  const viewAnchor=this._transform(anchor),delta=fromToQ(viewAnchor,[0,0,1]);
  this._focus={from:this._orientation.slice(),to:normalizeQ(multiplyQ(delta,this._orientation)),fromDistance:this._distance,toDistance:Math.max(Math.hypot(...anchor)+NEAR+.12,clamp(this._distance*.88,MIN_DISTANCE,MAX_DISTANCE)),elapsed:0,duration:.30};
  this._dirty=true;
 }
 _capture(id){
  if(this._captures.has(id))return;
  try{this.stage.setPointerCapture?.(id);this._captures.add(id);}catch{}
 }
 _release(id){
  if(!this._captures.delete(id))return;
  try{if(!this.stage.hasPointerCapture||this.stage.hasPointerCapture(id))this.stage.releasePointerCapture?.(id);}catch{}
 }
 _clearInput(notify){
  const moved=this._gestureMoved,ids=[...this._captures];
  this.pointers.clear();this._drag=null;this._pinchSpan=0;this._pinchDirect=false;this._gestureMoved=false;this._angularVelocity=[0,0,0];
  this._targetOrientation=this._orientation.slice();this._targetLogDistance=Math.log(this._distance);this._focus=null;
  this.stage.classList.remove('dragging');ids.forEach(id=>this._release(id));
  if(notify&&moved)this.onDragEnd?.();
 }
 bindInput(){
  const span=()=>{const p=[...this.pointers.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
  this.stage.addEventListener('pointerdown',e=>{
   if(this.flat||!this.active||e.button>0||this.pointers.size>=2)return;
   if(e.target?.closest?.('input,textarea,select,a,[data-action],[data-view]'))return;
   this._cancelFocus();this._angularVelocity=[0,0,0];
   if(!this.pointers.size){this._targetLogDistance=Math.log(this._distance);this._gestureMoved=false;}
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.pointers.size===1)this._drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,time:performance.now()};
   else{this._pinchSpan=span();this._drag=null;this._gestureMoved=true;this.setAuto(false);this.pointers.forEach((_,id)=>this._capture(id));}
  });
  this.stage.addEventListener('pointermove',e=>{
   if(!this.active||this.flat||!this.pointers.has(e.pointerId))return;
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.pointers.size===2){
    const next=span();
    if(this._pinchSpan>1&&next>1){this._targetLogDistance=clamp(this._targetLogDistance+Math.log(this._pinchSpan/next),Math.log(MIN_DISTANCE),Math.log(MAX_DISTANCE));this._pinchDirect=true;this._dirty=true;}
    this._pinchSpan=next;this._gestureMoved=true;return;
   }
   const d=this._drag;if(!d)return;
   if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<=6)return;
   if(!d.moved){d.moved=true;this._gestureMoved=true;this.setAuto(false);this._capture(e.pointerId);this.stage.classList.add('dragging');}
   const dx=e.clientX-d.lastX,dy=e.clientY-d.lastY,now=performance.now(),dt=clamp((now-d.time)/1000,1/240,.05);
   const ax=dy/Math.max(1,this.height)*(Math.PI*7/6),ay=dx/Math.max(1,this.width)*(Math.PI*7/6);
   this._targetOrientation=normalizeQ(multiplyQ(multiplyQ(axisQ(1,0,0,ax),axisQ(0,1,0,ay)),this._targetOrientation));
   this._angularVelocity=[clamp(ax/dt,-5,5),clamp(ay/dt,-5,5),0];
   d.lastX=e.clientX;d.lastY=e.clientY;d.time=now;this._dirty=true;
  });
  const end=e=>{
   if(!this.pointers.has(e.pointerId))return;
   this.pointers.delete(e.pointerId);this._release(e.pointerId);
   if(this.pointers.size===1){const p=[...this.pointers.values()][0];this._drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:true,time:performance.now()};this._pinchSpan=0;this._angularVelocity=[0,0,0];}
   else{const moved=this._gestureMoved;if(this._drag&&performance.now()-this._drag.time>100)this._angularVelocity=[0,0,0];this._drag=null;this._pinchSpan=0;this._gestureMoved=false;this.stage.classList.remove('dragging');if(moved)this.onDragEnd?.();}
  };
  this.stage.addEventListener('pointerup',end);
  this.stage.addEventListener('pointercancel',()=>this._clearInput(true));
  this.stage.addEventListener('lostpointercapture',e=>{if(e.target&&e.target!==this.stage)return;if(this.pointers.has(e.pointerId))this._clearInput(true);});
  window.addEventListener('pointerup',end);
  window.addEventListener('blur',()=>{this._clearInput(true);this._cancelMotion();this.last=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){this._clearInput(true);this._cancelMotion();}this.last=null;});
  this.stage.addEventListener('wheel',e=>{
   if(this.flat||!this.active)return;e.preventDefault();
   const unit=e.deltaMode===1?16:e.deltaMode===2?Math.max(1,this.height):1;
   this.zoomBy(Math.exp(clamp(e.deltaY*unit*.0032,-1.5,1.5)));
  },{passive:false});
 }
 draw(t){
  if(!this.active||!this.width||!this.height)return;
  const g=this.gl,u=this.uniforms;this._updateMatrix();
  g.clear(g.COLOR_BUFFER_BIT);g.useProgram(this.program);g.uniform2f(u.Resolution,this.width,this.height);g.uniformMatrix3fv(u.RotationMatrix,false,this._matrix);g.uniform1f(u.Distance,this._distance);g.uniform1f(u.Scale,this.scale);g.uniform1f(u.PixelRatio,this.dpr*(this.width<600?.8:1));g.uniform1f(u.Intensity,this.width<600?.72:1);g.uniform1f(u.Ignition,this.ignition);g.uniform1f(u.Time,this.reduced?0:t*.001);g.uniform1f(u.Halo,1);g.drawArrays(g.POINTS,0,this.count);g.uniform1f(u.Halo,3.8);g.drawArrays(g.POINTS,0,this.count);
 }
 tick(t){
  if(document.hidden||!this.active){this.last=null;this.raf=requestAnimationFrame(this.tick);return;}
  const dt=this.last===null?1/60:clamp((t-this.last)/1000,0,.08);this.last=t;
  let moving=false;
  if(this._focus){
   const f=this._focus;f.elapsed+=dt;const p=clamp(f.elapsed/f.duration,0,1),e=p*p*(3-2*p);
   this._setOrientation(slerpQ(f.from,f.to,e));this._targetOrientation=this._orientation.slice();
   this._assignDistance(f.fromDistance+(f.toDistance-f.fromDistance)*e);this._targetLogDistance=Math.log(this._distance);moving=true;
   if(p===1)this._focus=null;
  }else{
   this._setOrientation(this._targetOrientation);
   if(!this.flat&&!this.reduced&&!this.pointers.size){
    if(this.auto){this._setOrientation(multiplyQ(this._orientation,axisQ(0,1,0,dt*.026)));moving=true;}
    else{const v=this._angularVelocity,n=Math.hypot(...v);if(n>.008){this._setOrientation(multiplyQ(axisQ(v[0],v[1],v[2],n*dt),this._orientation));const decay=Math.exp(-8*dt);this._angularVelocity=v.map(x=>x*decay);moving=true;}else this._angularVelocity=[0,0,0];}
   }
   this._targetOrientation=this._orientation.slice();
   const current=Math.log(this._distance),difference=this._targetLogDistance-current;
   if(Math.abs(difference)>1e-6){const alpha=this._pinchDirect?1:1-Math.exp(-dt/.065);this._assignDistance(Math.exp(Math.abs(difference)<1e-5?this._targetLogDistance:current+difference*alpha));moving=true;}
   this._pinchDirect=false;
  }
  this._updateMatrix();
  if(this._poseDirty){this._poseDirty=false;this.onPose?.();}
  const zoom=Math.round(10.5/this._distance*100);if(zoom!==this._lastZoom){this._lastZoom=zoom;this.onZoom?.(zoom);}
  if(this._dirty||(!this.reduced&&(moving||this.pointers.size||t-this._lastDraw>=32))){this.draw(t);this._dirty=false;this._lastDraw=t;}
  this.raf=requestAnimationFrame(this.tick);
 }
}
window.StellarGalaxy=StellarGalaxy;
})();
