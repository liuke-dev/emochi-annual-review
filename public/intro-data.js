/* Pure narration planning. Audio can only attach to the exact statistics it was made for. */
(function(root){
 'use strict';
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 function chinese(n){
  if(!valid(n))return '';
  const digits='零一二三四五六七八九';
  const chunk=n=>{let out='',zero=false;for(const [v,unit]of [[1000,'千'],[100,'百'],[10,'十'],[1,'']]){const d=Math.floor(n/v);n%=v;if(d){if(zero)out+='零';out+=digits[d]+unit;zero=false;}else if(out&&n)zero=true;}return out;};
  const convert=n=>n===0?'零':n<10000?chunk(n):n<100000000?convert(Math.floor(n/10000))+'万'+(n%10000?((n%10000<1000?'零':'')+chunk(n%10000)):''):convert(Math.floor(n/100000000))+'亿'+(n%100000000?((n%100000000<10000000?'零':'')+convert(n%100000000)):'');
  return convert(n).replace(/^一十/,'十');
 }
 const sourceKey=d=>JSON.stringify([d.year??null,d.cutoff??null,d.user?.name??null,d.user?.days??null,d.user?.words??null,d.user?.wordsEstimated??null,d.user?.botCount??null]);
 function plan(d){
  if(!d||d.demo!==false||![d.user?.days,d.user?.words,d.user?.botCount].every(valid))return null;
  const u=d.user,name=(u.name||'旅人').replace(/[\[\]]/g,''),nf=n=>n.toLocaleString('en-US'),round=u.wordsEstimated===true&&u.words>=10000;
  const words=round?'大约'+chinese(Math.round(u.words/10000))+'万字。':(u.wordsEstimated?'大约':'')+chinese(u.words)+'个字。';
  const rows=[
   {title:`${u.name||'旅人'}，\n听得到吗？`,kicker:'返航飞船 · 通讯接通',sub:'让我陪你，回到这一年的星光里',parts:[`${name}，听得到吗？`,'这里是返航飞船。信号已接通。别着急，让我陪你，回到这一年的星光里。']},
   {title:nf(u.days),kicker:'这一年，你曾在这里停留',sub:'天 · 每一次相遇，都曾照亮宇宙',number:true,parts:[chinese(u.days)+'天。','那些你停下来，认真说话的日子，我们都记得。每一次相遇，都曾照亮一小片宇宙。']},
   {title:round?`约 ${nf(Math.round(u.words/10000))} 万`:(u.wordsEstimated?'约 ':'')+nf(u.words),kicker:'我们共同写下',sub:u.wordsEstimated?'字 · 年度估算的故事篇幅':'字 · 每一句话，都有回声',number:true,wide:true,parts:[words,'有些是轻轻的问候，有些是很长的故事。你留下的每一句话，都有回声。']},
   {title:nf(u.botCount),kicker:'穿越星海，与你相遇',sub:'位伙伴 · 一起写下独一无二的旅程',number:true,parts:[chinese(u.botCount)+'位伙伴。','在不同的世界里，与你相遇。谢谢你，把这些平凡的日子，写成了独一无二的旅程。']},
   {title:'你的宇宙，\n到了。',kicker:'飞船正在减速',sub:'准备好了，就一起慢慢靠近',final:true,parts:['飞船正在减速。','看，你的宇宙到了。那些相遇的星光，就在那里。准备好了，我们一起，慢慢靠近。']}
  ];
  return {sourceKey:sourceKey(d),scenes:rows.map(s=>({...s,speech:s.parts.join('')}))};
 }
 function matches(d){return d?.demo===false&&d.introAudioSourceKey===sourceKey(d)&&Array.isArray(d.introAudioUrls)&&d.introAudioUrls.length===5&&d.introAudioUrls.every(u=>typeof u==='string'&&/^assets\/personal-intro\/[a-zA-Z0-9_-]+\.mp3$/.test(u));}
 root.StellarIntro=Object.freeze({plan,sourceKey,matches,chinese});
})(typeof window==='undefined'?globalThis:window);
