import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicFixture } from './music-fixture.mjs';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const silent = f => { assert.equal(f.audible().length, 0); for (const audio of f.audios) assert.equal(audio.volume, 0); };

test('music stays lazy and disabled until enabled; hidden pages never create media', async () => {
  const f = createMusicFixture();
  f.player.setScene('intro', { restart: true }); f.player.setDucked(true);
  assert.equal(f.audios.length, 0);
  f.setHidden(true); f.player.setEnabled(true); await f.flush();
  assert.equal(f.audios.length, 0);
  f.setHidden(false); await f.settle();
  assert.equal(f.audios.length, 2); assert.equal(f.current().dataset.scene, 'intro');
});

test('the first gesture attempts both media elements and keeps the standby silent', async () => {
  const f = createMusicFixture(); f.player.setScene('intro'); f.player.setEnabled(true);
  assert.equal(f.audios.length, 2); assert.equal(f.requests.length, 2);
  assert.deepEqual(f.audios.map(audio => audio.id), ['background-music-a', 'background-music-b']);
  await f.settle(); close(f.current().volume, .22);
  assert.equal(f.audible().length, 1);
  assert.equal(f.audios.find(audio => audio !== f.current()).paused, true);
  assert.ok(f.audios.every(audio => audio.loop));
});

test('same-scene selection does not reload or restart; explicit restart seeks to clip zero', async () => {
  const f = createMusicFixture(); f.player.setEnabled(true); await f.settle();
  const audio = f.current(); audio.currentTime = 21.4;
  const loads = audio.loads, plays = audio.playCalls;
  f.player.setScene('galaxy'); await f.settle();
  close(audio.currentTime, 21.4); assert.equal(audio.loads, loads); assert.equal(audio.playCalls, plays);
  f.player.setScene('galaxy', { restart: true }); await f.settle();
  assert.equal(f.current(), audio); assert.equal(audio.currentTime, 0);
});

test('scene crossfades use two streams and return to the last heard galaxy position', async () => {
  const f = createMusicFixture(); f.player.setScene('galaxy', { restart: true }); f.player.setEnabled(true); await f.settle();
  const galaxy = f.current(); galaxy.currentTime = 35.25;
  f.player.setScene('romance'); await f.flush(); f.advance(550);
  assert.equal(f.audible().length, 2); assert.ok(galaxy.volume > 0 && galaxy.volume < .4);
  f.advance(600); await f.flush(); assert.equal(galaxy.paused, true);
  close(f.current().volume, .4); assert.equal(f.current().currentTime, 0);
  f.current().currentTime = 18; f.player.setScene('galaxy'); await f.settle();
  close(f.current().currentTime, 35.25);
  f.player.setScene('romance'); await f.settle(); assert.equal(f.current().currentTime, 0, 'a new world visit starts its authored segment');
  assert.equal(f.audios.length, 2);
});

test('per-track normal volumes and the duck ratio are preserved through scene changes', async () => {
  const levels = { intro: .22, galaxy: .4, romance: .4, fantasy: .2, dark: .21, scifi: .16 };
  const f = createMusicFixture(); f.player.setEnabled(true); await f.settle();
  for (const [scene, volume] of Object.entries(levels)) {
    f.player.setScene(scene); await f.settle(); close(f.current().volume, volume);
    f.player.setDucked(true); await f.settle(350); close(f.current().volume, volume * .28);
    f.player.setDucked(false); await f.settle(350); close(f.current().volume, volume);
  }
});

test('rapid scene changes ignore late old play promises without reviving the old scene', async () => {
  const f = createMusicFixture({ autoPlay: false });
  f.player.setScene('intro'); f.player.setEnabled(true);
  f.requests.slice().forEach(request => request.resolve()); await f.settle();
  f.player.setScene('romance'); const obsolete = f.requests.at(-1);
  f.player.setScene('dark'); const latest = f.requests.at(-1);
  obsolete.resolve(); await f.flush();
  assert.ok(f.audible().every(audio => audio.dataset.scene === 'intro'));
  latest.resolve(); await f.settle();
  assert.equal(f.current().dataset.scene, 'dark'); close(f.current().volume, .21);
  assert.equal(f.audible().length, 1); assert.equal(f.audios.length, 2);
});

test('late play completion after mute, suspension or stop never becomes audible', async () => {
  for (const interruption of ['mute', 'suspend', 'stop', 'hidden']) {
    const f = createMusicFixture({ autoPlay: false }); f.player.setEnabled(true);
    if (interruption === 'mute') f.player.setEnabled(false);
    if (interruption === 'suspend') f.player.setSuspended(true);
    if (interruption === 'stop') f.player.stop();
    if (interruption === 'hidden') f.setHidden(true);
    f.requests.slice().forEach(request => request.resolve()); await f.flush(); f.advance(2000);
    silent(f); assert.ok(f.audios.every(audio => audio.paused));
    assert.equal(f.frames.size, 0);
  }
});

test('hidden scene changes do not load/play and resume only the newest requested scene', async () => {
  const f = createMusicFixture(); f.player.setEnabled(true); await f.settle();
  f.current().currentTime = 12; f.setHidden(true);
  const requestCount = f.requests.length, loads = f.audios.reduce((n, audio) => n + audio.loads, 0);
  f.player.setScene('fantasy'); f.player.setScene('scifi'); await f.flush();
  assert.equal(f.requests.length, requestCount); assert.equal(f.audios.reduce((n, audio) => n + audio.loads, 0), loads); silent(f);
  f.setHidden(false); await f.settle();
  assert.equal(f.current().dataset.scene, 'scifi'); close(f.current().volume, .16);
});

test('stop and same-scene re-enable resume playback rather than leaving an equality-guard dead end', async () => {
  const f = createMusicFixture(); f.player.setEnabled(true); await f.settle(); f.current().currentTime = 47.5;
  f.player.stop(); silent(f);
  f.player.setScene('galaxy'); f.player.setSuspended(false); f.player.setEnabled(true); await f.settle();
  close(f.current().currentTime, 47.5); close(f.current().volume, .4); assert.equal(f.audible().length, 1);
});

test('a resumed scene stays silent until metadata permits the saved-position seek', async () => {
  const f = createMusicFixture({ autoMetadata: false }); f.player.setEnabled(true);
  f.audios.forEach(audio => audio.metadata()); await f.settle(); f.current().currentTime = 67.75;
  f.player.setScene('romance'); f.current().metadata(); await f.settle();
  f.player.setScene('dark'); f.current().metadata(); await f.settle(); // Evict the cached galaxy element.
  f.player.setScene('galaxy'); const incoming = f.current(); await f.flush(); f.advance(1200);
  assert.equal(incoming.volume, 0);
  incoming.metadata(); await f.settle(); close(incoming.currentTime, 67.75); close(incoming.volume, .4);
});

test('mobile autoplay rejection reuses the already unlocked element without another user gesture', async () => {
  const f = createMusicFixture({ autoPlay: false }); f.player.setScene('intro'); f.player.setEnabled(true);
  const activeRequest = f.requests[0]; activeRequest.resolve(); f.requests[1].reject(); await f.settle();
  const unlocked = f.current();
  f.player.setScene('galaxy'); f.requests.at(-1).reject('NotAllowedError'); await f.flush();
  f.advance(250); await f.flush();
  const retry = f.requests.at(-1); assert.equal(retry.audio, unlocked); assert.equal(retry.source, 'assets/music/galaxy.mp3');
  retry.resolve(); await f.settle();
  assert.equal(f.current(), unlocked); close(unlocked.volume, .4); assert.equal(f.errors.length, 0);
});

test('mute interrupts the unlocked-element fallback and prevents its delayed reload', async () => {
  const f = createMusicFixture({ autoPlay: false }); f.player.setEnabled(true);
  f.requests[0].resolve(); f.requests[1].reject(); await f.settle();
  f.player.setScene('dark'); f.requests.at(-1).reject(); await f.flush();
  const count = f.requests.length; f.player.setEnabled(false); f.advance(2000); await f.flush();
  assert.equal(f.requests.length, count); silent(f);
});

test('current media errors stop cleanly while stale outgoing errors cannot silence the new track', async () => {
  const f = createMusicFixture(); f.player.setEnabled(true); await f.settle();
  const outgoing = f.current(), oldError = outgoing.onerror;
  f.player.setScene('romance'); await f.flush(); f.advance(400);
  oldError(); f.advance(900); await f.flush();
  assert.equal(f.current().dataset.scene, 'romance'); close(f.current().volume, .4); assert.equal(f.errors.length, 0);
  f.current().fail(); await f.flush(); silent(f); assert.equal(f.errors.length, 1); assert.equal(f.errors[0].scene, 'romance');
});

test('animation time anomalies never write an invalid HTMLAudioElement volume', async () => {
  const f = createMusicFixture(); f.player.setEnabled(true); await f.flush();
  f.frame(-100); f.player.setDucked(true); f.frame(5000); await f.flush();
  for (const audio of f.audios) assert.ok(audio.volume >= 0 && audio.volume <= 1);
});
