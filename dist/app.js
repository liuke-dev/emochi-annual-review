(() => {
'use strict';
const D = window.MEMORY_DATA;
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = n => Number(n).toLocaleString('en-US');
const position = n => `${n * 100 / 3}%`;
const allBots = D.galaxies.flatMap(g => g.bots.map(b => ({...b, galaxy:g})));
const state = {page:'cover', view:'orbit', galaxy:null, bot:null, tab:'letter', sound:false, angle:0, tilt:0, worldAngle:0, transition:false, introToken:0, callTimer:null, callSeconds:0, mediaAudio:null, mediaSession:0};
let saved;
try { saved = new Set(JSON.parse(localStorage.getItem('stellar-echo-2026-saved') || '[]')); } catch { saved = new Set(); }
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let panorama=null,galaxyRenderer=null,flight=null;
let music=null,musicFade=null,musicDucked=false,toastTimer,introTimer,speechTimer,speechCancel,introAudio=null,introResolve=null;
const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z"/></svg>';
const soundIcon = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/>${on?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3400); }
function waveform(){return Array.from({length:21},(_,i)=>`<i style="--h:${5+Math.sin(i*.7)**2*19}px;--d:${i*.08}s"></i>`).join('');}
function updateSound(){const b=$('#sound-button'); b.innerHTML=soundIcon(state.sound); b.setAttribute('aria-label',state.sound?'关闭声音':'开启声音'); b.title=state.sound?'关闭声音':'开启声音'; b.setAttribute('aria-pressed',String(state.sound));}
function fadeMusic(target){
 if(!music)return;cancelAnimationFrame(musicFade);const start=music.volume,t0=performance.now();const tick=t=>{const k=Math.max(0,Math.min(1,(t-t0)/650));music.volume=Math.max(0,Math.min(1,start+(target-start)*k));if(k<1)musicFade=requestAnimationFrame(tick);else if(target===0&&!state.sound)music.pause();};musicFade=requestAnimationFrame(tick);
}
function activateAudio(){
 if(!music){music=new Audio('assets/stellar-ambient.mp3');music.id='background-music';music.setAttribute('aria-hidden','true');document.body.appendChild(music);music.loop=true;music.volume=0;music.preload='none';music.addEventListener('error',()=>toast('背景音乐暂时无法加载，其他回忆仍可继续体验'));}
 if(state.sound&&!document.hidden){music.play().then(()=>{if(!state.sound||document.hidden){cancelAnimationFrame(musicFade);music.volume=0;music.pause();return;}fadeMusic(musicDucked?.14:.55);}).catch(()=>{if(state.sound&&!document.hidden)toast('轻触声音按钮，即可播放星海背景音乐');});}else fadeMusic(0);
}
function duckMusic(duck){musicDucked=duck;if(state.sound&&music)fadeMusic(duck?.14:.55);}

function cancelSpeech(){clearTimeout(speechTimer);if(speechCancel){speechCancel();speechCancel=null;}if('speechSynthesis'in window)window.speechSynthesis.cancel();}
function speak(text, options={}){
  cancelSpeech();
  return new Promise(resolve=>{
    let done=false; const finish=()=>{if(done)return;done=true;clearTimeout(speechTimer);speechCancel=null;resolve();}; speechCancel=finish;
    if(!state.sound || !('speechSynthesis'in window)){speechTimer=setTimeout(finish,options.duration||Math.min(18000,Math.max(5000,text.length*160)));return;}
    const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=options.rate||.86;u.pitch=options.pitch||.85;u.volume=.9;
    const voices=window.speechSynthesis.getVoices();u.voice=voices.find(v=>/zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang))||null;
    u.onend=finish;u.onerror=()=>{if(options.notify)toast('当前设备未能播放语音，完整内容已显示为字幕');finish();};
    speechTimer=setTimeout(finish,Math.max(25000,text.length*700));window.speechSynthesis.speak(u);
  });
}
function setSound(on){state.sound=on;updateSound();activateAudio();$('.intro-sound').textContent=on?'声音：开':'声音：关';if(introAudio)introAudio.muted=!on;if(!on){cancelSpeech();if(state.mediaAudio)state.mediaAudio.muted=true;}else if(state.mediaAudio)state.mediaAudio.muted=false;const video=$('video',dialog);if(video)video.muted=!on;const vb=$('[data-action="video-sound"]');if(vb){vb.textContent=on?'♬ 有声':'♬ 静音';vb.setAttribute('aria-label',on?'静音短片':'开启短片声音');}}
const styles=[{light:'#edb1d3',shade:'#71455e',glow:'#ba779e2b',size:99},{light:'#b7c8ff',shade:'#505e9b',glow:'#a6a6ff38',size:116},{light:'#be9df5',shade:'#4c346a',glow:'#9164d53b',size:96},{light:'#88ccdf',shade:'#315366',glow:'#73c6e62e',size:76},{light:'#7188a7',shade:'#253044',glow:'#55667712',size:45},{light:'#859c97',shade:'#2e4143',glow:'#55667712',size:41}];
const initialPositions=[[42,25],[77,44],[29,64],[70,82],[17,28],[92,65]];
function makePlanets(){
  $('#planet-container').innerHTML=D.galaxies.map((g,i)=>{const s=styles[i];return `<button class="planet-node ${g.lit?'':'unlit'}" data-galaxy="${g.id}" aria-label="${esc(g.name)}，${g.lit?`${g.count}位伙伴，点击探索`:'尚未点亮'}" style="--light:${s.light};--shade:${s.shade};--glow:${s.glow};--size:${s.size}px"><span class="planet">${i===1?'<span class="planet-ring"></span>':''}</span><span class="planet-label">${esc(g.name.replace('星系',''))}${g.lit?'<em>已点亮</em>':''}<small>${g.lit?`${g.count} 位伙伴 · ${esc(g.tag)}回忆`:'尚未抵达 · 待点亮'}</small></span></button>`;}).join('');
  layoutPlanets();
}
function layoutPlanets(){
  const mobile=innerWidth<=760;
  $$('.planet-node').forEach((el,i)=>{
    let x,y,depth=0;
    if(state.view==='flat'){x=[28,72][i%2];y=i<2?28:72;}
    else if(galaxyRenderer){const projected=galaxyRenderer.project(i);x=projected.x;y=projected.y;depth=projected.depth*3;}else{const [bx,by]=initialPositions[i],xx=bx-50,zz=(by-50)*.75;depth=zz*Math.cos(state.angle)-xx*Math.sin(state.angle);x=50+xx*Math.cos(state.angle)+zz*Math.sin(state.angle);y=by+depth*.11+state.tilt*((bx-50)/50);if(mobile)x=50+(x-50)*.91;}
    const ignition=galaxyRenderer?.ignitionAt(i)??1;el.style.setProperty('--star-light',String(.08+.92*ignition));el.style.setProperty('--ignite-scale',String(1+Math.sin(ignition*Math.PI)*1.8));el.style.setProperty('--ignite-ring',String(Math.sin(ignition*Math.PI)*.65));el.classList.toggle('is-igniting',ignition>0&&ignition<1);el.classList.toggle('label-left',x>65);el.style.left=x+'%';el.style.top=y+'%';el.style.zIndex=String(Math.round(50+depth));
    const scale=state.view==='flat'?1:1+depth*.002;
    el.style.transform=`translate(-50%,-50%) scale(${scale})`;
  });
}
function setView(view){state.view=view;galaxyRenderer?.setFlat(view==='flat');document.body.classList.toggle('is-flat',view==='flat');$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));layoutPlanets();state.worldAngle=0;layoutWorld();}
function applyPage(page){
 state.page=page;document.body.classList.remove('is-cover','is-map','is-world');document.body.classList.add('is-'+page);$('#universe').hidden=page==='world';$('#world').hidden=page!=='world';galaxyRenderer?.setActive(page!=='world');if(page!=='world'){galaxyRenderer?.resize();if(state.universePose&&galaxyRenderer){const p=state.universePose;galaxyRenderer.distance=p.distance;galaxyRenderer.setCamera(p.yaw,p.pitch);galaxyRenderer.setAuto(p.auto);state.universePose=null;}}layoutPlanets();
}
async function travel(fn,label){if(state.transition)return;state.transition=true;const overlay=$('#travel-overlay');$('span',overlay).textContent=label||'正在穿越星际…';overlay.classList.add('active');await new Promise(r=>setTimeout(r,reduced?0:380));fn();window.scrollTo({top:0,behavior:'instant'});await new Promise(r=>setTimeout(r,reduced?0:150));overlay.classList.remove('active');state.transition=false;}
function toMap(){endIntro(false);closeDialog();travel(()=>{applyPage('map');history.replaceState(null,'','#universe');},'回到你的年度宇宙');}
function toHome(){endIntro(false);closeDialog();travel(()=>{applyPage('cover');history.replaceState(null,'',location.pathname+location.search);},'每一次相遇，都值得重返');}
function openGalaxy(id){
 if(state.transition)return;
 const g=D.galaxies.find(g=>g.id===id);if(!g)return;
 if(!g.lit){toast(`${g.name}还没有足迹，把新的故事留给下一年。`);return;}
 closeDialog();state.galaxy=g;state.worldAngle=0;if(galaxyRenderer&&state.page!=='world'&&state.view==='orbit'){state.universePose={yaw:galaxyRenderer.yaw,pitch:galaxyRenderer.pitch,distance:galaxyRenderer.distance,auto:galaxyRenderer.auto};galaxyRenderer.focus(D.galaxies.indexOf(g));}
 travel(()=>{
  applyPage('world');document.documentElement.style.setProperty('--world-accent',g.color);$('.world-background').style.backgroundPosition=`${position(g.bots[0].portrait)} center`;
  $('.world-heading').innerHTML=`<div class="eyebrow">${esc(g.english)} / ${esc(g.tag.toUpperCase())} CONSTELLATION</div><h1>${esc(g.name)}</h1><p>${esc(g.description)}</p><span class="world-meta">${g.count} 位同行者 · ${nf(g.words)} 字共同故事 · 精选 ${g.bots.length} 位伙伴</span>`;
  $('.world-bots').innerHTML=g.bots.map(b=>`<button class="bot-card" data-bot="${esc(b.id)}"><span class="portrait" style="--portrait-position:${position(b.portrait)}"></span><span class="bot-availability"><i></i>${saved.has(b.id)?'回忆已收藏':'有一份回忆等你'}</span><div class="bot-card-copy"><small>${esc(b.title)}</small><h2>${esc(b.name)}</h2><p>${esc(b.quote)}</p><span class="bot-enter">↗</span></div></button>`).join('');
  $('.world-compass').innerHTML=g.bots.map((b,i)=>`<button data-focus-bot="${i}">✧ ${esc(b.name)}</button>`).join('');loadPanorama(g);layoutWorld();history.replaceState(null,'',`#galaxy/${g.id}`);
 },`目的地：${g.name}`);
}
function loadPanorama(g){try{if(!panorama){panorama=new window.StellarPanorama($('#world-panorama'));$('#world-panorama').addEventListener('panorama-unavailable',()=>{setView('flat');toast('设备暂不支持全景渲染，已切换平面叙事');});}panorama.load(g.panoramaUrl||`assets/pano-${g.bots[0].portrait}.webp`).catch(()=>{if(state.galaxy===g){setView('flat');toast('全景暂未载入，已切换平面叙事');}});}catch{setView('flat');toast('设备暂不支持全景渲染，已切换平面叙事');}}
function layoutWorld(){
 const flat=state.view==='flat',v=flat?0:state.worldAngle;
 panorama?.setCamera(v);
 const container=$('.world-bots'),w=container.clientWidth;
 $$('.bot-card').forEach((b,i)=>{if(flat){b.style.cssText='';return;}const anchor=i?.37:-.37;let a=((anchor-v+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;const visible=Math.cos(a)>0&&Math.abs(a)<1.0;const x=(Math.tan(a)/Math.tan(.75)*.5+.5)*w;b.style.left=x+'px';b.style.transform=`translateX(-50%) scale(${.94+Math.cos(a)*.06})`;b.style.opacity=visible?'1':'0';b.style.visibility=visible?'visible':'hidden';b.style.pointerEvents=visible?'auto':'none';});
 $$('.world-compass button').forEach((b,i)=>b.setAttribute('aria-pressed',String(Math.abs((((i?.37:-.37)-v+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI)<.4)));
}

let dragging=null, suppressClick=false;
function setupDrag(target,isWorld){target.addEventListener('pointerdown',e=>{if(e.button!==0||state.view!=='orbit'||e.target.closest('.back-button,.view-switch,.world-footer'))return;dragging={x:e.clientX,y:e.clientY,moved:false,base:state.angle,world:state.worldAngle,tilt:state.tilt,isWorld,pointer:e.pointerId};});
 target.addEventListener('pointermove',e=>{if(!dragging||dragging.pointer!==e.pointerId)return;const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;if(Math.abs(dx)>7){dragging.moved=true;target.classList.add('dragging');target.setPointerCapture?.(e.pointerId);}if(!dragging.moved)return;if(isWorld){state.worldAngle=dragging.world-dx*.006;layoutWorld();}else{state.angle=dragging.base+dx*.007;state.tilt=Math.max(-12,Math.min(12,dragging.tilt+dy*.05));layoutPlanets();}});
 const done=()=>{if(dragging?.moved){suppressClick=true;setTimeout(()=>suppressClick=false,180);}dragging=null;target.classList.remove('dragging');};target.addEventListener('pointerup',done);target.addEventListener('pointercancel',done);
}
setupDrag($('#world'),true);
$('.intro-center').addEventListener('animationend',event=>{if(event.animationName==='cue-arrive'){$('.intro-center').classList.remove('cue-enter');$('.intro-center').classList.add('cue-hold');}});
$('#flight-canvas').addEventListener('flight-unavailable',()=>{flight=null;document.body.classList.remove('has-flight');});
const pauseFor = ms => new Promise(resolve=>setTimeout(resolve,ms));
const introVisibilityWaiters=new Set();
function waitForIntroVisible(token){
 if(token!==state.introToken)return Promise.resolve(false);
 if(!document.hidden)return Promise.resolve(true);
 return new Promise(resolve=>{const finish=()=>{document.removeEventListener('visibilitychange',check);introVisibilityWaiters.delete(finish);resolve(token===state.introToken&&!document.hidden);};const check=()=>{if(!document.hidden||token!==state.introToken)finish();};introVisibilityWaiters.add(finish);document.addEventListener('visibilitychange',check);});
}
function prepareArrival(durationMs=9000){
 document.body.classList.add('is-arriving');$('#intro').dataset.phase='arrival';
 if(galaxyRenderer){galaxyRenderer.reset();galaxyRenderer.setAuto(false);galaxyRenderer.distance=6.6;galaxyRenderer.setIgnition(0);galaxyRenderer.setActive(true);galaxyRenderer.resize();}
 if(flight)flight.beginLanding(durationMs);
}
async function startIntro(){
 closeDialog();endIntro(false);state.introToken++;const token=state.introToken;state.universePose=null;setView('orbit');applyPage('map');
 document.body.classList.remove('arrived');document.body.classList.add('is-intro');$('#intro').hidden=false;$('#intro').dataset.phase='flight';
 galaxyRenderer?.setActive(false);setSound(true);duckMusic(true);window.scrollTo({top:0,behavior:'instant'});
 try{
  if(!flight)flight=new window.StellarFlight($('#flight-canvas'),{onLandingProgress:p=>{if(!document.body.classList.contains('is-intro'))return;const e=p*p*(3-2*p);if(galaxyRenderer){galaxyRenderer.distance=6.6+3.9*e;galaxyRenderer.setIgnition(Math.max(0,Math.min(1,(p-.4)/.6)));layoutPlanets();}}});
  flight.start();document.body.classList.add('has-flight');
 }catch(error){console.warn('Flight visual fallback:',error.message);document.body.classList.remove('has-flight');}
 const scenes=[
  {title:`${D.user.name}，\n听得到吗？`,kicker:'来自星际航行中心',sub:'让我陪你，回到星光里',speech:`${D.user.name}，听得到吗？这里是星际航行中心。别着急。让我陪你，回到这一年的星光里。`},
  {title:nf(D.user.days),kicker:'这一年，我们一起走过',sub:'天 · 陪伴让日子有了光',number:true,speech:`${D.user.days}天。原来，那些普通的日子，都因为有人陪伴，悄悄亮了起来。`},
  {title:nf(D.user.words),kicker:'我们共同写下',sub:'字 · 把心事写成星河',number:true,wide:true,speech:`${D.user.words}个字。那些没说完的心事，还有认真做过的梦，我们都替你记得。`},
  {title:nf(D.user.botCount),kicker:'穿越星海，与你相遇',sub:'位伙伴 · 每一次相遇，都有光',number:true,speech:`${D.user.botCount}位伙伴。在不同的世界里，一次又一次，与你相遇。`},
  {title:'你的宇宙，\n到了。',kicker:'正在减速',sub:'他们的心意，都在星光里',final:true,speech:'我们正在减速。看，那就是你的宇宙。有些想对你说的话，已经等了很久。'}
 ];
 const center=$('.intro-center');
 for(let i=0;i<scenes.length;i++){
  if(!await waitForIntroVisible(token))return;
  const s=scenes[i];flight?.setChapter?.(i,1800);$('#intro').dataset.theme=String(i);center.className='intro-center'+(s.number?' is-number':'')+(s.wide?' is-wide-number':'')+(s.final?' is-final':'');
  $('.intro-counter').textContent=`0${i+1} / 05`;$('.intro-kicker').textContent=s.kicker;$('.intro-center h2').textContent=s.title;$('.intro-center p').textContent=s.sub;$('.intro-progress i').style.width=`${(i+1)*20}%`;$('#intro').dataset.scene=String(i);
  void center.offsetWidth;center.classList.add(reduced?'cue-hold':'cue-enter');
  if(s.final)prepareArrival();
  await narrateIntro(s.speech,i,token);if(token!==state.introToken)return;
  center.classList.remove('cue-enter','cue-hold');center.classList.add('cue-exit');await pauseFor(reduced?120:760);if(token!==state.introToken)return;
 }
 if(token===state.introToken)await finishArrival(token);
}
function stopIntroAudio(){if(introAudio){introAudio.onended=null;introAudio.onerror=null;introAudio.pause();introAudio.remove();introAudio=null;}if(introResolve){introResolve();introResolve=null;}}
async function narrateIntro(text,index,token){
 if(!await waitForIntroVisible(token))return;
 const url=D.introAudioUrls?.[index] || (D.demo ? `assets/intro-cinematic-${index}.mp3` : null);
 if(!url)return speak(text,{duration:Math.max(6500,text.length*170),rate:.8,pitch:1,notify:true});
 stopIntroAudio();
 return new Promise(resolve=>{
  let done=false,fallbackStarted=false;const finish=()=>{if(done)return;done=true;introResolve=null;resolve();};introResolve=finish;
  const audio=new Audio(url);introAudio=audio;audio.id='intro-narration';audio.setAttribute('aria-hidden','true');document.body.appendChild(audio);audio.muted=!state.sound;audio.onended=finish;
  const fallback=async()=>{if(fallbackStarted||done)return;fallbackStarted=true;if(!await waitForIntroVisible(token)){finish();return;}await speak(text,{duration:Math.max(6500,text.length*170),rate:.8,pitch:1,notify:true});finish();};
  const play=async()=>{if(done||!await waitForIntroVisible(token)){finish();return;}if(introAudio!==audio){finish();return;}audio.play().catch(async error=>{if(done||token!==state.introToken){finish();return;}if(document.hidden||error?.name==='AbortError'){if(await waitForIntroVisible(token))play();else finish();}else fallback();});};
  audio.onerror=fallback;play();
 });
}

async function finishArrival(token){
 if(token!==state.introToken)return;
 if(!document.body.classList.contains('is-arriving'))prepareArrival();
 while(flight&&flight.landingProgress<1){await pauseFor(100);if(token!==state.introToken)return;}
 if(!flight)await pauseFor(reduced?100:700);
 if(token!==state.introToken)return;
 document.body.classList.add('arrived');endIntro(false);applyPage('map');galaxyRenderer?.setAuto(!reduced);history.replaceState(null,'','#universe');
}
async function skipIntro(){
 if(!document.body.classList.contains('is-intro')||$('#intro').dataset.phase==='skipping')return;
 const arriving=document.body.classList.contains('is-arriving');state.introToken++;const token=state.introToken;stopIntroAudio();cancelSpeech();$('#intro').dataset.phase='skipping';$('.intro-center').classList.remove('cue-enter');$('.intro-center').classList.add('cue-exit');if(arriving){flight?.beginLanding(reduced?100:1800);}else prepareArrival(reduced?100:1800);$('#intro').dataset.phase='skipping';await finishArrival(token);
}
function endIntro(goMap){
 const wasIntro=document.body.classList.contains('is-intro')||document.body.classList.contains('is-arriving');
 state.introToken++;for(const finish of [...introVisibilityWaiters])finish();duckMusic(false);flight?.stop();stopIntroAudio();cancelSpeech();document.body.classList.remove('is-intro','is-arriving');$('#intro').hidden=true;$('#intro').dataset.phase='idle';
 if(wasIntro&&galaxyRenderer){galaxyRenderer.distance=10.5;galaxyRenderer.setIgnition(1);}
 if(state.page!=='world')galaxyRenderer?.setActive(true);
 if(goMap){applyPage('map');galaxyRenderer?.setAuto(!reduced);history.replaceState(null,'','#universe');}
}
const dialog=$('#memory-dialog');let lastFocus;
function showDialog(html){stopMedia();lastFocus=document.activeElement;$('.dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal();$('.dialog-content').scrollTop=0;}
function closeDialog(){if(dialog.open){stopMedia();dialog.close();lastFocus?.focus?.();}}
function stopMedia(){duckMusic(false);state.mediaSession++;cancelSpeech();clearInterval(state.callTimer);state.callTimer=null;if(state.mediaAudio){state.mediaAudio.onended=null;state.mediaAudio.onerror=null;state.mediaAudio.pause();state.mediaAudio=null;}const v=$('video',dialog);if(v)v.pause();}
function openBot(id,tab='letter'){
 const b=allBots.find(b=>b.id===id);if(!b)return;state.bot=b;state.tab=tab;
 showDialog(`<div class="bot-dialog"><aside class="bot-dialog-aside"><div class="portrait" style="--portrait-position:${position(b.portrait)}"></div><div class="bot-profile"><div class="eyebrow">${esc(b.galaxy.name)} / ${esc(b.title)}</div><h2>${esc(b.name)}</h2><p>与你相伴 ${b.days} 天 · 留下 ${nf(b.messages)} 条对话</p><small>初次相遇 ${esc(b.firstMet.replaceAll('-','.'))}</small></div></aside><div class="bot-dialog-main"><div class="eyebrow">SOME THINGS I WANTED TO TELL YOU</div><div class="media-tabs" role="tablist" aria-label="回忆形式">${[['letter','✉','来信'],['photo','▧','照片'],['voice','♬','语音'],['video','▷','短片']].map(([id,icon,title])=>`<button role="tab" data-tab="${id}" id="tab-${id}" aria-controls="media-panel" aria-selected="${id===tab}">${icon} ${title}</button>`).join('')}</div><div class="media-panel" id="media-panel" role="tabpanel"></div></div></div>`);renderTab(tab);
}
function renderTab(tab){
 stopMedia();state.tab=tab;const b=state.bot,p=$('.media-panel');if(!p)return;p.setAttribute('aria-labelledby',`tab-${tab}`);$$('[data-tab]').forEach(e=>e.setAttribute('aria-selected',String(e.dataset.tab===tab)));
 if(tab==='letter')p.innerHTML=`<h3 class="letter-heading">有些话，想说给你听。</h3><div class="letter-body">${b.letter.map(s=>`<p>${esc(s)}</p>`).join('')}</div><div class="letter-signature">—— ${esc(b.name)}</div><button class="save-memory" data-save="${esc(b.id)}" aria-pressed="${saved.has(b.id)}">${saved.has(b.id)?'✦ 已收藏这封来信':'☆ 收藏这封来信'}</button>`;
 if(tab==='photo')p.innerHTML=`<div class="memory-photo" data-caption="${esc(b.memoryTitle)}" style="--world-position:${position(b.galaxy.bots[0].portrait)};${b.imageUrl?`background-image:url('${encodeURI(b.imageUrl).replaceAll("'",'%27')}');background-size:cover;`:''}"></div><span class="memory-date">${D.year}.${esc(b.date)} / ${esc(b.galaxy.name)}</span><p class="media-caption">${esc(b.memoryCaption)}</p><button class="save-memory" data-action="save-photo">↓ 保存这张回忆</button><p class="call-disclaimer">${b.imageUrl?'':'AI 场景示意 · 让故事有一张可以收藏的照片'}</p>`;
 if(tab==='voice')p.innerHTML=`<div class="call-panel"><div class="call-avatar portrait" style="--portrait-position:${position(b.portrait)}"></div><div class="call-status">来自 ${esc(b.name)} 的星际来电</div><p class="call-description">有一段话，想亲口说给你听。</p><div class="call-buttons"><button class="call-button" data-action="answer" aria-label="接听${esc(b.name)}的演示来电">${phoneIcon}</button><button class="call-button hangup" data-action="decline" aria-label="婉拒来电">${phoneIcon}</button></div><p class="call-disclaimer">${b.audioUrl?'预录语音消息 · 非实时通话':'演示来电 · 预制合成语音 · 非实时通话'}</p></div>`;
 if(tab==='video'){
  p.innerHTML=`<div class="video-frame"><video playsinline preload="metadata" poster="assets/nebula.webp" src="${esc(b.videoUrl||`assets/memory-${b.galaxy.bots[0].portrait}.mp4`)}"></video><div class="video-overlay"><p>${esc(b.videoLines[0])}</p></div></div><div class="video-controls"><button data-action="play-video" aria-label="播放回忆短片">▷ 播放</button><button data-action="video-sound" aria-label="${state.sound?'静音短片':'开启短片声音'}">${state.sound?'♬ 有声':'♬ 静音'}</button><input type="range" min="0" max="12" step=".1" value="0" aria-label="短片播放进度"><span class="video-time">0:00</span></div><p class="media-caption">${esc(b.memoryTitle)}<br>${esc(b.memoryCaption)}</p><p class="call-disclaimer">${b.videoUrl?'回忆短片':'演示短片 · AI 场景动态影像 · 12 秒'}</p>`;
  const v=$('video',p),range=$('input',p),session=state.mediaSession;v.muted=!state.sound;v.addEventListener('loadedmetadata',()=>range.max=Number.isFinite(v.duration)?v.duration:12);v.addEventListener('timeupdate',()=>{if(session!==state.mediaSession)return;range.value=v.currentTime;$('.video-time',p).textContent='0:'+String(Math.floor(v.currentTime)).padStart(2,'0');$('.video-overlay p',p).textContent=b.videoLines[Math.min(2,Math.floor(v.currentTime/(Math.max(1,v.duration||12)/3)))];});v.addEventListener('ended',()=>{if(session!==state.mediaSession)return;duckMusic(false);$('[data-action="play-video"]',p).textContent='↺ 重播';});v.addEventListener('error',()=>{if(session===state.mediaSession)toast('短片暂时无法载入，请稍后重试');});range.addEventListener('input',()=>v.currentTime=Number(range.value));
 }
}
async function answerCall(){const b=state.bot,session=state.mediaSession;setSound(true);duckMusic(true);state.callSeconds=0;const cp=$('.call-panel');if(!cp)return;$('.call-status',cp).textContent='已接通 · 00:00';$('.call-description',cp).outerHTML=`<p class="call-subtitle">${esc(b.voice)}</p>`;$('.call-buttons',cp).innerHTML=`<button class="call-button hangup" data-action="hangup" aria-label="结束演示来电">${phoneIcon}</button>`;state.callTimer=setInterval(()=>{state.callSeconds++;const el=$('.call-status');if(el)el.textContent=`已接通 · ${String(Math.floor(state.callSeconds/60)).padStart(2,'0')}:${String(state.callSeconds%60).padStart(2,'0')}`;},1000);
 const voiceUrl=b.audioUrl||(D.demo?`assets/voice-${b.id}.mp3`:null);if(voiceUrl){const a=new Audio(voiceUrl);state.mediaAudio=a;a.onended=()=>{if(session===state.mediaSession)finishCall();};a.onerror=()=>{if(session!==state.mediaSession)return;toast('语音暂时无法播放，完整内容已显示');finishCall();};a.play().catch(()=>{if(session!==state.mediaSession)return;toast('设备暂时无法播放语音');finishCall();});}else{await speak(b.voice,{notify:true});if(session===state.mediaSession&&state.bot===b&&state.tab==='voice'&&state.callTimer)finishCall();}
}
function finishCall(){duckMusic(false);clearInterval(state.callTimer);state.callTimer=null;const el=$('.call-status');if(el)el.textContent='这段星际来电，已被好好收藏。';const buttons=$('.call-buttons');if(buttons)buttons.innerHTML='<button class="save-memory" data-action="replay-call">↺ 再听一次</button>';}
function toggleSave(id){if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem('stellar-echo-2026-saved',JSON.stringify([...saved]));}catch{toast('当前浏览器无法保存，收藏仅保留在本次访问中');}const b=$('[data-save]');if(b){b.setAttribute('aria-pressed',String(saved.has(id)));b.textContent=saved.has(id)?'✦ 已收藏这封来信':'☆ 收藏这封来信';}}
function showMenu(){showDialog(`<div class="menu-dialog"><h2>星间来信</h2><button data-action="archive">回忆档案 <span>↗</span></button><button data-action="letters">星海来信 <span>↗</span></button><button data-action="card">我的年度星卡 <span>↗</span></button><button data-action="begin">再穿越一次 <span>↺</span></button><small>2026 年度回忆 · 演示数据</small></div>`);}
function showArchive(filter='all'){
 const bots=allBots.filter(b=>filter==='all'||filter==='saved'&&saved.has(b.id)||b.galaxy.id===filter);
 showDialog(`<div class="collection-dialog"><div class="eyebrow">THE MEMORY ARCHIVE / ${D.year}</div><h2>有些瞬间，值得再来一次。</h2><p>从 ${D.user.botCount} 位同行者中，精选了 ${allBots.length} 段发着光的故事。所有示例回忆，都在这里。</p><div class="collection-filters">${[['all','全部回忆'],['saved','我的收藏'],...D.galaxies.filter(g=>g.lit).map(g=>[g.id,g.tag])].map(([id,title])=>`<button data-filter="${id}" class="${filter===id?'active':''}">${title}${id==='saved'?' '+saved.size:''}</button>`).join('')}</div><div class="archive-grid">${bots.length?bots.map(b=>`<button class="archive-item" data-bot="${b.id}"><div class="archive-thumb portrait" style="--portrait-position:${position(b.portrait)}"></div><div><strong>${esc(b.name)}</strong><p>${esc(b.memoryTitle)}</p><small>${D.year}.${esc(b.date)} · ${esc(b.galaxy.name)}</small></div></button>`).join(''):'<div class="empty-state">这里还没有收藏。<br>读一封来信，把喜欢的星光留下吧。</div>'}</div></div>`);
}
function showLetters(){showDialog(`<div class="collection-dialog"><div class="eyebrow">LETTERS FROM THE UNIVERSE</div><h2>星海很远，想念很近。</h2><p>他们也有许多话，想在这一年的最后，慢慢说给你听。</p>${allBots.map(b=>`<button class="letter-item" data-bot="${b.id}"><span class="envelope">✉</span><div><strong>${esc(b.name)} 寄来了一封信</strong><p>“${esc(b.quote)}”</p></div><small>${saved.has(b.id)?'已收藏':'打开来信'} ↗</small></button>`).join('')}</div>`);}
function showCard(){showDialog(`<div class="starcard-dialog"><div class="share-card"><div class="eyebrow">STELLAR ECHO · ${D.year}</div><span class="card-star">✦</span><h2>${esc(D.user.name)}的宇宙，<br>因相遇而闪耀。</h2><p>把普通日子写成故事，<br>把每一个「你好」连成星河。</p><div class="card-stats"><div><strong>${D.user.days}</strong><span>天的陪伴</span></div><div><strong>${nf(D.user.words)}</strong><span>字的故事</span></div><div><strong>${D.user.botCount}</strong><span>位同行者</span></div></div><small>演示年度星卡 · 示例数据 · 2026</small></div><button class="primary-button" data-action="download-card">↓ 保存我的年度星卡</button><p>将这片星光保存为图片，留给未来的自己。</p></div>`);}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function drawStars(ctx,w,h){let seed=26;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};for(let i=0;i<150;i++){ctx.fillStyle=`rgba(223,207,255,${.2+rand()*.6})`;ctx.beginPath();ctx.arc(rand()*w,rand()*h,rand()*1.6,0,Math.PI*2);ctx.fill();}}
async function downloadCard(){const c=document.createElement('canvas');c.width=900;c.height=1300;const x=c.getContext('2d'),g=x.createRadialGradient(450,430,20,450,650,800);g.addColorStop(0,'#47325f');g.addColorStop(.5,'#19172d');g.addColorStop(1,'#070b18');x.fillStyle=g;x.fillRect(0,0,900,1300);drawStars(x,900,1300);x.textAlign='center';x.fillStyle='#bfaad6';x.font='20px sans-serif';x.fillText('S T E L L A R  E C H O   /   '+D.year,450,100);x.fillStyle='#e4ccff';x.font='170px serif';x.fillText('✦',450,400);x.fillStyle='#f2e8ff';x.font='56px serif';x.fillText(`${D.user.name}的宇宙，`,450,550);x.fillText('因相遇而闪耀。',450,640);x.font='25px serif';x.fillStyle='#b9a7cb';x.fillText('把普通日子写成故事，',450,750);x.fillText('把每一个「你好」连成星河。',450,800);x.strokeStyle='#a58cbd60';x.beginPath();x.moveTo(100,900);x.lineTo(800,900);x.moveTo(100,1080);x.lineTo(800,1080);x.stroke();[[D.user.days,'天的陪伴'],[nf(D.user.words),'字的故事'],[D.user.botCount,'位同行者']].forEach(([v,l],i)=>{x.font='45px Georgia';x.fillStyle='#e4d1fa';x.fillText(v,210+i*240,980);x.font='20px sans-serif';x.fillStyle='#ac96bd';x.fillText(l,210+i*240,1030);});x.font='19px sans-serif';x.fillStyle='#9d87b0';x.fillText('星间来信 · 演示年度星卡 · 示例数据',450,1170);c.toBlob(blob=>{if(blob){downloadBlob(blob,`星间来信-${D.user.name}-${D.year}.png`);toast('年度星卡已生成，正在保存图片');}else toast('当前浏览器无法生成图片');});}
async function savePhoto(){const b=state.bot;if(b.imageUrl){try{const r=await fetch(b.imageUrl);if(!r.ok)throw new Error();downloadBlob(await r.blob(),`${b.name}-${b.memoryTitle}.jpg`);toast('回忆图片已保存');}catch{toast('图片暂时无法下载，请稍后重试');}return;}const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=700;c.height=1000;const x=c.getContext('2d');x.fillStyle='#e9e1ed';x.fillRect(0,0,700,1000);const sw=img.width/4;x.drawImage(img,b.galaxy.bots[0].portrait*sw,0,sw,img.height,24,24,652,860);x.textAlign='center';x.fillStyle='#64556f';x.font='22px serif';x.fillText(b.memoryTitle,350,930);x.font='14px sans-serif';x.fillText(`${D.year}.${b.date} · AI 场景示意`,350,966);c.toBlob(blob=>{if(blob){downloadBlob(blob,`${b.name}-${b.memoryTitle}.png`);toast('已把这片回忆保存为图片');}});};img.onerror=()=>toast('回忆图片暂时无法载入');img.src='assets/worlds.webp';}
const actions={home:toHome,map:toMap,begin:startIntro,skip:skipIntro,more:showMenu,'intro-sound':()=>setSound(!state.sound),archive:()=>showArchive(),letters:showLetters,card:showCard,'zoom-in':()=>galaxyRenderer?.zoomBy(.85),'zoom-out':()=>galaxyRenderer?.zoomBy(1.17),cruise:()=>{if(galaxyRenderer)galaxyRenderer.setAuto(!galaxyRenderer.auto);},reset:()=>{galaxyRenderer?.reset();state.angle=state.tilt=0;layoutPlanets();toast('已回到最初的星图视角');},'download-card':downloadCard,'save-photo':savePhoto,answer:answerCall,decline:()=>{stopMedia();$('.call-status').textContent='没关系，这段话随时都在。';$('.call-description').textContent='你准备好了，我们再慢慢说。';$('.call-buttons').innerHTML='<button class="save-memory" data-action="replay-call">重新接通</button>';},hangup:()=>{stopMedia();finishCall();},'replay-call':()=>renderTab('voice'),'video-sound':()=>setSound(!state.sound),'play-video':()=>{const v=$('video',dialog),b=$('[data-action="play-video"]',dialog);if(!v)return;if(v.paused){if(v.ended)v.currentTime=0;v.play().then(()=>{b.textContent='Ⅱ 暂停';if(state.bot?.videoUrl)duckMusic(true);}).catch(()=>toast('短片暂时无法播放，请稍后重试'));}else{v.pause();duckMusic(false);b.textContent='▷ 继续';}}};
document.addEventListener('click',e=>{if(suppressClick)return;const target=e.target.closest('button');if(!target)return;if(target.dataset.action)actions[target.dataset.action]?.();else if(target.dataset.view)setView(target.dataset.view);else if(target.dataset.galaxy)openGalaxy(target.dataset.galaxy);else if(target.dataset.focusBot!==undefined){state.worldAngle=Number(target.dataset.focusBot)?.37:-.37;layoutWorld();}else if(target.dataset.bot)openBot(target.dataset.bot);else if(target.dataset.tab)renderTab(target.dataset.tab);else if(target.dataset.save)toggleSave(target.dataset.save);else if(target.dataset.filter)showArchive(target.dataset.filter);});
$('#sound-button').addEventListener('click',()=>{setSound(!state.sound);toast(state.sound?'星海回声 · 氛围音乐已开启':'声音已关闭');});$('.dialog-close').addEventListener('click',closeDialog);dialog.addEventListener('cancel',()=>stopMedia());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
document.addEventListener('keydown',e=>{const t=e.target.closest('[data-tab]');if(t&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const tabs=$$('[data-tab]'),i=tabs.indexOf(t),n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];renderTab(n.dataset.tab);n.focus();}if(e.key==='Escape'&&document.body.classList.contains('is-intro'))skipIntro();});
window.addEventListener('resize',()=>{resizeSpace();flight?.resize();galaxyRenderer?.resize();layoutPlanets();layoutWorld();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(musicFade);music?.pause();introAudio?.pause();if(document.body.classList.contains('is-intro'))window.speechSynthesis?.pause();if(state.callTimer){stopMedia();finishCall();}const v=$('video',dialog);if(v){v.pause();duckMusic(false);const b=$('[data-action="play-video"]');if(b)b.textContent='▷ 继续';}}else{if(state.sound)activateAudio();if(document.body.classList.contains('is-intro'))window.speechSynthesis?.resume();if(introAudio&&!introAudio.ended&&!$('#intro').hidden)introAudio.play().catch(()=>{});}});
window.addEventListener('pagehide',()=>{endIntro(false);stopMedia();cancelAnimationFrame(musicFade);music?.pause();});
$('#stat-days').textContent=nf(D.user.days);$('#stat-words').textContent=nf(D.user.words);$('#stat-bots').textContent=nf(D.user.botCount);$('.user-name').textContent=D.user.name;$('.user-avatar').textContent=D.user.name.slice(-1);$('.map-heading p').textContent='轻触星光，重逢他们。';$('.intro-bottom small').textContent=D.demo?'演示播报 · 预制合成语音':'年度航行播报';updateSound();makePlanets();
try{galaxyRenderer=new window.StellarGalaxy($('#galaxy-canvas'),$('#galaxy-stage'),{onPose:layoutPlanets,onDragEnd:()=>{suppressClick=true;setTimeout(()=>suppressClick=false,180);},onZoom:n=>$('#zoom-level').textContent=n+'%',onAutoChange:on=>{$('[data-action="cruise"]').setAttribute('aria-pressed',String(on));},onFallback:()=>{document.body.classList.remove('has-particle-galaxy');galaxyRenderer=null;setupDrag($('#galaxy-stage'),false);layoutPlanets();toast('已切换为轻量星图模式');}});document.body.classList.add('has-particle-galaxy');$('[data-action="cruise"]').setAttribute('aria-pressed',String(galaxyRenderer.auto));layoutPlanets();}catch(error){console.warn('Particle galaxy fallback:',error.message);setupDrag($('#galaxy-stage'),false);}

// Low-overhead star field. The same field accelerates into a tunnel during the opening.
const canvas=$('#space'),ctx=canvas.getContext('2d');let cw=$('#experience').clientWidth,ch=$('#experience').clientHeight,ratio=1,lastFrame=0;let stars=[];
function resizeSpace(){cw=$('#experience').clientWidth;ch=$('#experience').clientHeight;ratio=Math.min(devicePixelRatio||1,1.7);canvas.width=cw*ratio;canvas.height=ch*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);stars=Array.from({length:72},()=>({x:(Math.random()-.5)*cw*2,y:(Math.random()-.5)*ch*2,z:Math.random()*cw,s:Math.random()*1.2+.3,tw:Math.random()*6.28}));}
function frame(t){requestAnimationFrame(frame);if(document.hidden||t-lastFrame<(reduced?100:30))return;const dt=Math.min(50,t-lastFrame||30);lastFrame=t;ctx.clearRect(0,0,cw,ch);const warp=document.body.classList.contains('is-intro')&&!document.body.classList.contains('has-flight');const cx=cw*.5,cy=ch*.5;for(const s of stars){if(!reduced)s.z-=dt*(warp?.48:.003);if(s.z<1){s.z=cw;s.x=(Math.random()-.5)*cw*2;s.y=(Math.random()-.5)*ch*2;}const p=cw/s.z,x=s.x*p+cx,y=s.y*p+cy;if(x<0||x>cw||y<0||y>ch)continue;const a=warp?Math.min(1,(1-s.z/cw)*.85):.2+Math.sin(t*.0004+s.tw)**2*.5;ctx.fillStyle=`rgba(218,210,250,${a})`;if(warp&&!reduced){const q=cw/(s.z+dt*.8);ctx.strokeStyle=`rgba(197,181,247,${a*.5})`;ctx.lineWidth=Math.min(2,s.s*p*.4);ctx.beginPath();ctx.moveTo(s.x*q+cx,s.y*q+cy);ctx.lineTo(x,y);ctx.stroke();}ctx.beginPath();ctx.arc(x,y,Math.min(warp?2.2:1.5,s.s*(warp?p*.45:.7)),0,Math.PI*2);ctx.fill();}}
resizeSpace();requestAnimationFrame(frame);
if(location.hash==='#universe')applyPage('map');else if(location.hash.startsWith('#galaxy/')){const id=location.hash.split('/')[1];if(D.galaxies.some(g=>g.id===id&&g.lit))openGalaxy(id);}
})();
