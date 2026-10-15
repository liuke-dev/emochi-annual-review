/* Fetch only the current private preview's normalized data. Never silently replace failed real data with demo data. */
(async()=>{
 const overlay=document.createElement('section');overlay.className='data-gate';overlay.setAttribute('aria-live','polite');document.body.append(overlay);
 const mode=new URLSearchParams(location.search).get('demo')==='1'||window.STELLAR_MODE==='demo'?'demo':window.STELLAR_MODE==='snapshot'?'snapshot':'live';
 const script=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
 async function load(){
  overlay.innerHTML='<span class="gate-star">✦</span><h1>星光正在归航</h1><p>正在收拢属于你的这一年</p>';
  try{
   if(mode==='demo')await script('data.js');
   else if(mode==='snapshot'){await script('snapshot.js');if(window.MEMORY_DATA?.demo!==false||!Array.isArray(window.MEMORY_DATA.galaxies))throw new Error('invalid_response');}
   else{
    const r=await fetch('/api/annual-data',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(35000)});
    let body;try{body=await r.json();}catch{throw new Error('unavailable');}
    if(!r.ok)throw new Error(body.code||'unavailable');
    if(body.demo!==false||!Array.isArray(body.galaxies))throw new Error('invalid_response');
    window.MEMORY_DATA=body;
   }
   await script('app.js');document.body.classList.remove('data-loading');overlay.remove();
  }catch(e){
   const messages={sign_in_required:'请先登录，开启只属于你的回忆。',not_built:'你的年度回忆还在准备中。稍后再来，这片星海会亮起来。',not_configured:'这段航程还未连接到你的回忆。',forbidden_region:'暂时无法在当前区域查看这段年度回忆。',upstream_unauthorized:'回忆连接已失效，请联系管理员更新连接。'};
   overlay.replaceChildren();
   const star=document.createElement('span');star.className='gate-star';star.textContent='✦';
   const heading=document.createElement('h1');heading.textContent='星际讯号暂未抵达';
   const text=document.createElement('p');text.textContent=messages[e.message]||'暂时没有接收到回忆。请稍后重试。';
   const retry=document.createElement('button');retry.textContent='重新连接';retry.onclick=load;
   const link=document.createElement('a');link.textContent=e.message==='sign_in_required'?'登录后开启':'先看看演示';link.href=e.message==='sign_in_required'?'/signin-with-chatgpt?return_to=%2Findex.html':'?demo=1';link.target='_top';
   overlay.append(star,heading,text,retry,link);
  }
 }
 await load();
})();
