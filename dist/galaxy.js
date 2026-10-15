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
class StellarGalaxy{
 constructor(canvas,stage,{onPose,onDragEnd,onZoom,onAutoChange,onFallback}={}){
  this.canvas=canvas;this.stage=stage;this.onPose=onPose;this.onDragEnd=onDragEnd;this.onZoom=onZoom;this.onAutoChange=onAutoChange;this.onFallback=onFallback;
  this.yaw=.28;this.pitch=.71;this.distance=10.5;this.ignition=1;this.auto=true;this.flat=false;this.active=true;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.auto=!this.reduced;this.velocity=0;this.zoomVelocity=0;this.pointers=new Map();this.last=0;this.width=1;this.height=1;this.quality=11000;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power',premultipliedAlpha:true});if(!gl)throw new Error('WebGL unavailable');this.gl=gl;
  const vert=`attribute vec3 aPosition;attribute vec4 aColor;attribute float aSize;attribute float aGroup;uniform vec2 uResolution;uniform vec2 uRotation;uniform float uDistance;uniform float uScale;uniform float uPixelRatio;uniform mediump float uHalo;uniform float uTime;uniform float uIntensity;uniform float uIgnition;varying mediump vec4 vColor;void main(){float cy=cos(uRotation.x),sy=sin(uRotation.x);vec3 p=vec3(aPosition.x*cy+aPosition.z*sy,aPosition.y,-aPosition.x*sy+aPosition.z*cy);float cp=cos(uRotation.y),sp=sin(uRotation.y);p=vec3(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);float depth=max(1.0,uDistance-p.z);float k=10.5/depth;gl_Position=vec4(p.x*uScale*k*2.0/uResolution.x,p.y*uScale*k*2.0/uResolution.y,0.,1.);float phase=aGroup>.5?clamp((uIgnition-(aGroup-1.)*.18)/.32,0.,1.):1.;float glow=mix(.05,1.,smoothstep(0.,1.,phase));float pulse=sin(phase*3.14159265);gl_PointSize=clamp(aSize*k*uPixelRatio*uHalo*(1.+pulse*.28),.8,96.);float twinkle=.88+.12*sin(uTime*.65+aPosition.x*5.+aPosition.z*9.);vColor=vec4(aColor.rgb*(1.+pulse*.35),aColor.a*twinkle*uIntensity*glow);}`;
  const frag=`precision mediump float;varying mediump vec4 vColor;uniform mediump float uHalo;void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv)*2.;if(d>1.)discard;float light=exp(-d*d*(uHalo>1.5?4.5:6.5));float core=pow(max(0.,1.-d),5.);float alpha=vColor.a*(uHalo>1.5?.055:1.)*light;gl_FragColor=vec4(vColor.rgb*(1.+core*.4),alpha);}`;
  const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error('Galaxy shader unavailable: '+info);}return sh;};
  const vs=compile(gl.VERTEX_SHADER,vert),fs=compile(gl.FRAGMENT_SHADER,frag);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Galaxy program unavailable: '+gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.uniforms={};['Resolution','Rotation','Distance','Scale','PixelRatio','Halo','Time','Intensity','Ignition'].forEach(n=>this.uniforms[n]=gl.getUniformLocation(this.program,'u'+n));
  this.buildCloud();gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  this.resize();this.bindInput();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.active=false;cancelAnimationFrame(this.raf);this.onFallback?.();});
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
 resize(){this.width=this.stage.clientWidth;this.height=this.stage.clientHeight;this.dpr=Math.min(devicePixelRatio||1,innerWidth<=760?1.4:1.6);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.scale=Math.min(this.width/10.6,this.height/6.5);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.draw(performance.now());}
 project(index){const p=anchorXYZ[index];if(!p)return{x:50,y:50,depth:0,scale:1};const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);const xx=p[0]*cy+p[2]*sy,zz=-p[0]*sy+p[2]*cy,yy=p[1]*cp-zz*sp,z=p[1]*sp+zz*cp,k=10.5/(this.distance-z);return{x:(.5+xx*this.scale*k/this.width)*100,y:(.5-yy*this.scale*k/this.height)*100,depth:z,scale:clamp(k,.75,1.25)};}
 ignitionAt(index){if(index>3)return 1;const x=clamp((this.ignition-index*.18)/.32,0,1);return x;}
 setIgnition(value){this.ignition=clamp(value,0,1);this.draw(performance.now());this.onPose?.();}
 setCamera(yaw,pitch){this.yaw=yaw;this.pitch=clamp(pitch,.18,1.48);this.draw(performance.now());this.onPose?.();}
 setFlat(flat){this.flat=flat;this.onPose?.();this.draw(performance.now());}
 setActive(active){this.active=active;if(!active)cancelAnimationFrame(this.focusRaf);this.last=0;}
 setAuto(on){this.auto=on;this.velocity=0;this.onAutoChange?.(on);}
 zoomBy(factor){this.distance=clamp(this.distance*factor,7.3,16.5);this.onZoom?.(Math.round(10.5/this.distance*100));this.onPose?.();this.draw(performance.now());}
 reset(){this.yaw=.28;this.pitch=.71;this.distance=10.5;this.velocity=0;this.onPose?.();this.onZoom?.(100);this.draw(performance.now());}
 focus(index){const p=anchorXYZ[index];this.setAuto(false);const endYaw=Math.atan2(p[2],p[0])-Math.PI/2,startYaw=this.yaw,startDistance=this.distance,delta=Math.atan2(Math.sin(endYaw-startYaw),Math.cos(endYaw-startYaw)),t0=performance.now();const run=t=>{const v=clamp((t-t0)/500,0,1),e=v*v*(3-2*v);this.yaw=startYaw+delta*e;this.distance=startDistance+(7.4-startDistance)*e;this.onPose?.();this.draw(t);if(v<1)this.focusRaf=requestAnimationFrame(run);};cancelAnimationFrame(this.focusRaf);this.focusRaf=requestAnimationFrame(run);}
 bindInput(){
  let drag=null,pinch=0;
  const distance=()=>{const pts=[...this.pointers.values()];return pts.length<2?0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);};
  this.stage.addEventListener('pointerdown',e=>{if(this.flat||!this.active||e.button>0)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size===1)drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};if(this.pointers.size===2){pinch=distance();this.setAuto(false);}});
  this.stage.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId)||this.flat)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size===2){const next=distance();if(pinch>0&&next>0)this.zoomBy(pinch/next);pinch=next;if(drag)drag.moved=true;return;}if(!drag)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){drag.moved=true;this.setAuto(false);this.stage.setPointerCapture?.(e.pointerId);this.stage.classList.add('dragging');}if(drag.moved){this.yaw+=dx*.006;this.pitch=clamp(this.pitch+dy*.004,.18,1.48);this.velocity=dx*.00028;this.onPose?.();this.draw(performance.now());}drag.lastX=e.clientX;drag.lastY=e.clientY;});
  const end=e=>{this.pointers.delete(e.pointerId);if(drag?.moved)this.onDragEnd?.();if(!this.pointers.size){drag=null;this.stage.classList.remove('dragging');}else if(this.pointers.size===1){const p=[...this.pointers.values()][0];drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:true};}pinch=distance();};this.stage.addEventListener('pointerup',end);this.stage.addEventListener('pointercancel',end);
  this.stage.addEventListener('wheel',e=>{if(this.flat||!this.active)return;e.preventDefault();this.zoomBy(Math.exp(e.deltaY*.001));},{passive:false});
 }
 draw(t){if(!this.active||!this.width||!this.height)return;const g=this.gl,u=this.uniforms;g.clear(g.COLOR_BUFFER_BIT);g.useProgram(this.program);g.uniform2f(u.Resolution,this.width,this.height);g.uniform2f(u.Rotation,this.yaw,this.pitch);g.uniform1f(u.Distance,this.distance);g.uniform1f(u.Scale,this.scale);g.uniform1f(u.PixelRatio,this.dpr*(this.width<600?.8:1));g.uniform1f(u.Intensity,this.width<600?.72:1);g.uniform1f(u.Ignition,this.ignition);g.uniform1f(u.Time,this.reduced?0:t*.001);g.uniform1f(u.Halo,1);g.drawArrays(g.POINTS,0,this.count);g.uniform1f(u.Halo,3.8);g.drawArrays(g.POINTS,0,this.count);}
 tick(t){this.raf=requestAnimationFrame(this.tick);if(document.hidden||!this.active){this.last=t;return;}if(t-this.last<32)return;const dt=Math.min(.06,(t-this.last)/1000||.032);this.last=t;if(!this.flat&&!this.reduced&&!this.pointers.size){if(this.auto)this.yaw+=dt*.026;else if(Math.abs(this.velocity)>.00005){this.yaw+=this.velocity*dt*30;this.velocity*=.94;}this.onPose?.();}this.draw(t);}
}
window.StellarGalaxy=StellarGalaxy;
})();
