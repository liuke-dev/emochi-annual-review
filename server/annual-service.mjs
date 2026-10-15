const BASE = 'https://staging.afterglow.kaonai.com';
const headers = {'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
class ApiFailure extends Error { constructor(code,status,requestId){super(code);Object.assign(this,{code,status,requestId});} }
export function createAnnualService({normalize,fetchImpl=(input,options)=>globalThis.fetch(input,options)}) {
 return async function handle(request,env,{local=false}={}) {
  const url=new URL(request.url);
  const signedId=request.headers.get('oai-authenticated-user-id');
  const ownerEmail=env.ANNUAL_OWNER_EMAIL;
  const signedOwner=ownerEmail&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===ownerEmail.toLowerCase();
  if(!signedId&&!signedOwner&&!local)return reply({code:'sign_in_required'},401);
  if(request.method!=='GET')return reply({code:'method_not_allowed'},405);
  // This preview is pinned to one configured subject; browser input never selects another user.
  if(url.search)return reply({code:'invalid_argument'},400);
  if(!env.ANNUAL_API_TOKEN||!env.ANNUAL_USER_ID)return reply({code:'not_configured'},503);
  async function upstream(path,json=true){
   let response;
   try{response=await fetchImpl(BASE+path,{headers:{Authorization:`Bearer ${env.ANNUAL_API_TOKEN}`,userId:env.ANNUAL_USER_ID,Accept:json?'application/json':'audio/mpeg'},redirect:'manual',signal:AbortSignal.timeout(25000)});}
   catch(error){const detail=String(error?.message||'request failed').split(String(env.ANNUAL_API_TOKEN)).join('[redacted]').split(String(env.ANNUAL_USER_ID)).join('[redacted]').slice(0,300);console.warn('Annual upstream connection:',error?.name||'Error',detail);throw new ApiFailure('upstream_unavailable',502);}
   const rid=response.headers.get('X-Request-Id');
   if(!response.ok)throw new ApiFailure(response.status===401?'upstream_unauthorized':response.status===403?'forbidden_region':'upstream_unavailable',response.status===401||response.status===403?response.status:502,rid);
   if(!json)return response;
   if(!response.headers.get('Content-Type')?.includes('json'))throw new ApiFailure('invalid_response',502,rid);
   try{return await response.json();}catch{throw new ApiFailure('invalid_response',502,rid);}
  }
  async function snapshot(){
   const paths={annual:'/v1/annual',profile:'/v1/views/profile',summary:'/v1/views/summary',content:'/v1/annual/content',call:'/v1/annual/call'};
   const entries=await Promise.all(Object.entries(paths).map(async([key,path])=>{
    try{return[key,await upstream(path+'?period=2026')];}
    catch(e){if(key==='annual'||[401,403].includes(e.status))throw e;return[key,{status:'unavailable'}];}
   }));
   return normalize(Object.fromEntries(entries));
  }
  try{
   if(url.pathname==='/api/annual-data')return reply(await snapshot());
   const match=url.pathname.match(/^\/api\/audio\/([a-zA-Z0-9_-]{1,100})$/);
   if(match){
    const data=await snapshot(),path='/v1/audio/'+match[1];
    const allowed=data.galaxies.some(g=>g.bots.some(b=>b.callSegments.some(s=>s.audioUrl===path)));
    if(!allowed)return reply({code:'not_found'},404);
    const audio=await upstream(path,false);
    if(!/audio\//i.test(audio.headers.get('Content-Type')||''))return reply({code:'invalid_audio'},502);
    return new Response(audio.body,{headers:{...headers,'Content-Type':'audio/mpeg'}});
   }
   return reply({code:'not_found'},404);
  }catch(e){return reply({code:e.code||'not_ready',...(e.requestId?{requestId:e.requestId}:{})},e.status>=400&&e.status<=599?e.status:e.code==='not_built'?409:503);}
 };
}
