import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnualService } from '../server/annual-service.mjs';

// Isolated review fixtures only. No real network, credentials or user data.
const env = { ANNUAL_API_TOKEN: 'fixture-service-secret', ANNUAL_USER_ID: 'fixture-fixed-subject' };
const origin = 'https://fixture-private-site.invalid';
const signed = { 'oai-authenticated-user-id': 'fixture-site-owner' };
const normalized = () => ({ galaxies: [{ bots: [{ callSegments: [{ audioUrl: '/v1/audio/owned_audio' }] }] }] });
function fixture({ normalize = normalized, responder } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (responder) return responder(url, options);
    return url.includes('/v1/audio/')
      ? new Response('fixture-mp3', { headers: { 'Content-Type': 'audio/mpeg', 'Set-Cookie': 'must-not-forward=1' } })
      : Response.json({ status: 'ready', raw_secret_marker: 'must-not-return-raw' });
  };
  return { calls, handle: createAnnualService({ normalize, fetchImpl }) };
}
function request(path, extra = {}) { return new Request(origin + path, { headers: signed, ...extra }); }
function privateResponse(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('anonymous requests stop before any upstream access; explicit local mode is the only bypass', async () => {
  const f = fixture();
  const denied = await f.handle(new Request(origin + '/api/annual-data'), env);
  assert.equal(denied.status, 401); privateResponse(denied); assert.equal(f.calls.length, 0);
  assert.equal((await f.handle(new Request(origin + '/api/annual-data'), env, { local: true })).status, 200);
});
test('all non-GET methods are rejected without upstream work', async () => {
  const f = fixture();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const res = await f.handle(request('/api/annual-data', { method }), env);
    assert.equal(res.status, 405); privateResponse(res);
  }
  assert.equal(f.calls.length, 0);
});
test('browser-supplied subjects, periods and upstream paths cannot be selected by query', async () => {
  const f = fixture();
  for (const search of ['?userId=other', '?period=2025', '?url=https://outside.invalid', '?unused=']) {
    assert.equal((await f.handle(request('/api/annual-data' + search), env)).status, 400);
  }
  assert.equal(f.calls.length, 0);
});
test('only annual-data and an exact restricted audio id path are accepted', async () => {
  const f = fixture();
  for (const path of ['/api/annual', '/api/tasks', '/api/audio/', '/api/audio/a/b', '/api/audio/a%2fb', '/api/audio/' + 'x'.repeat(101)]) {
    assert.equal((await f.handle(request(path), env)).status, 404);
  }
  assert.equal(f.calls.length, 0);
});
test('upstream auth and subject are fixed env values; browser headers and raw bodies stay private', async () => {
  const f = fixture();
  const res = await f.handle(request('/api/annual-data', { headers: { ...signed, Authorization: 'Bearer browser-secret', userId: 'browser-other-subject' } }), env);
  assert.equal(res.status, 200); privateResponse(res); assert.equal(f.calls.length, 5);
  for (const call of f.calls) {
    assert.ok(call.url.startsWith('https://staging.afterglow.kaonai.com/v1/'));
    assert.ok(call.url.endsWith('?period=2026'));
    assert.equal(call.options.headers.Authorization, 'Bearer ' + env.ANNUAL_API_TOKEN);
    assert.equal(call.options.headers.userId, env.ANNUAL_USER_ID);
    assert.equal(call.options.redirect, 'manual');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  const body = await res.text();
  for (const marker of [env.ANNUAL_API_TOKEN, env.ANNUAL_USER_ID, 'browser-secret', 'must-not-return-raw']) assert.ok(!body.includes(marker));
});
test('unknown audio ids fail after current-user snapshot, before any audio fetch', async () => {
  const f = fixture();
  const res = await f.handle(request('/api/audio/other_users_audio'), env);
  assert.equal(res.status, 404); privateResponse(res); assert.equal(f.calls.length, 5);
  assert.ok(f.calls.every(c => !c.url.includes('/v1/audio/')));
});
test('audio disappearing from normalized visible bots is denied on the next request', async () => {
  let visible = true;
  const f = fixture({ normalize: () => visible ? normalized() : { galaxies: [{ bots: [] }] } });
  assert.equal((await f.handle(request('/api/audio/owned_audio'), env)).status, 200);
  visible = false; f.calls.length = 0;
  assert.equal((await f.handle(request('/api/audio/owned_audio'), env)).status, 404);
  assert.ok(f.calls.every(c => !c.url.includes('/v1/audio/')));
});
test('owned audio streams with private response headers and no forwarded upstream cookies', async () => {
  const f = fixture();
  const res = await f.handle(request('/api/audio/owned_audio'), env);
  assert.equal(res.status, 200); privateResponse(res);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(await res.text(), 'fixture-mp3'); assert.equal(f.calls.length, 6);
});
test('an upstream authorization failure on an optional source fails the entire snapshot closed', async () => {
  const f = fixture({ responder: url => url.includes('/views/profile')
    ? new Response('fixture-service-secret must not leak', { status: 401, headers: { 'X-Request-Id': 'fixture-request' } })
    : Response.json({ status: 'ready' }) });
  const res = await f.handle(request('/api/annual-data'), env);
  assert.equal(res.status, 401); privateResponse(res);
  assert.deepEqual(await res.json(), { code: 'upstream_unauthorized', requestId: 'fixture-request' });
});
test('upstream redirects/network exceptions cannot expose errors containing credentials', async () => {
  const f = fixture({ responder: () => { throw new Error(env.ANNUAL_API_TOKEN); } });
  const res = await f.handle(request('/api/annual-data'), env);
  assert.equal(res.status, 502); privateResponse(res);
  assert.deepEqual(await res.json(), { code: 'upstream_unavailable' });
});
test('unexpected audio content types fail closed and missing configuration exposes no values', async () => {
  const f = fixture({ responder: url => url.includes('/v1/audio/')
    ? new Response('<html>unexpected</html>', { headers: { 'Content-Type': 'text/html' } })
    : Response.json({ status: 'ready' }) });
  const invalidAudio = await f.handle(request('/api/audio/owned_audio'), env);
  assert.equal(invalidAudio.status, 502); privateResponse(invalidAudio);
  assert.deepEqual(await invalidAudio.json(), { code: 'invalid_audio' });
  const missing = await f.handle(request('/api/annual-data'), {});
  assert.equal(missing.status, 503); privateResponse(missing);
  assert.deepEqual(await missing.json(), { code: 'not_configured' });
});

test('a platform-injected owner email supports private Sites hosts without a user-id header', async () => {
 const f=fixture(),ownerEnv={...env,ANNUAL_OWNER_EMAIL:'owner@example.invalid'};
 const noId=email=>new Request(origin+'/api/annual-data',{headers:{'oai-authenticated-user-email':email}});
 assert.equal((await f.handle(noId('other@example.invalid'),ownerEnv)).status,401);
 assert.equal(f.calls.length,0);
 assert.equal((await f.handle(noId('owner@example.invalid'),env)).status,401);
 assert.equal((await f.handle(noId('owner@example.invalid'),ownerEnv)).status,200);
});


test('manual redirects are rejected without forwarding credentials to another origin', async()=>{
 const f=fixture({responder:()=>new Response(null,{status:302,headers:{Location:'https://outside.invalid'}})});
 const r=await f.handle(request('/api/annual-data'),env);
 assert.equal(r.status,502);assert.equal(f.calls.length,5);
 assert.ok(f.calls.every(c=>c.options.redirect==='manual'&&c.url.startsWith('https://staging.afterglow.kaonai.com/')));
});
