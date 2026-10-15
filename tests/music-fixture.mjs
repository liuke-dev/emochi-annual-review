import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Controlled media promises deliberately allow late playback after pause/load.
// This is stricter than typical browsers and exposes stale-request regressions.
export function createMusicFixture({ autoPlay = true, autoMetadata = true, hidden = false } = {}) {
  let now = 0, nextFrame = 0;
  const frames = new Map(), audios = [], errors = [], requests = [], listeners = new Map();
  const document = {
    hidden, body: { appendChild() {} },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(value => value !== callback)); }
  };
  class FakeAudio {
    constructor() {
      this.dataset = {}; this.id = ''; this.src = ''; this.loop = false; this.preload = 'none';
      this.paused = true; this.readyState = autoMetadata ? 4 : 0; this.duration = autoMetadata ? 203 : NaN;
      this.currentTime = 0; this.error = null; this._volume = 1; this.loads = 0; this.playCalls = 0; this.pauseCalls = 0;
      audios.push(this);
    }
    set volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Invalid audio volume');
      this._volume = value;
    }
    get volume() { return this._volume; }
    setAttribute() {}
    load() { this.loads++; this.currentTime = 0; this.error = null; this.readyState = autoMetadata ? 4 : 0; this.duration = autoMetadata ? 203 : NaN; }
    pause() { this.pauseCalls++; this.paused = true; }
    play() {
      this.playCalls++;
      let accept, refuse;
      const promise = new Promise((resolve, reject) => { accept = resolve; refuse = reject; });
      const request = { audio: this, source: this.src, settled: false,
        resolve: () => { if (request.settled) return; request.settled = true; this.paused = false; accept(); },
        reject: (name = 'NotAllowedError') => { if (request.settled) return; request.settled = true; const error = new Error(name); error.name = name; refuse(error); }
      };
      requests.push(request);
      if (autoPlay) request.resolve();
      return promise;
    }
    metadata(duration = 203) { this.duration = duration; this.readyState = 4; this.onloadedmetadata?.(); }
    fail() { this.error = { code: 2 }; this.onerror?.(); }
  }
  const context = { window: {}, document, Audio: FakeAudio, performance: { now: () => now },
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id), console };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../public/music.js', import.meta.url), 'utf8'), context);
  const player = new context.window.StellarMusic({ onError: error => errors.push(error) });
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  function frame(milliseconds = 1000 / 60) {
    now += milliseconds;
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(now);
  }
  function advance(milliseconds) { const count = Math.max(1, Math.ceil(Math.abs(milliseconds) / (1000 / 60))); for (let i = 0; i < count; i++) frame(milliseconds / count); }
  async function settle(milliseconds = 1200) { await flush(); advance(milliseconds); await flush(); }
  function setHidden(value) { document.hidden = value; for (const callback of [...(listeners.get('visibilitychange') || [])]) callback(); }
  const current = () => audios.find(audio => audio.dataset.role === 'current');
  const audible = () => audios.filter(audio => !audio.paused && audio.volume > .0001);
  return { player, audios, errors, requests, document, frames, flush, frame, advance, settle, setHidden, current, audible };
}
