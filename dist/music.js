/* Two-element streaming music player. All track files begin at their authored cue. */
(function () {
  'use strict';
  const TRACKS = Object.freeze(Object.fromEntries(['intro', 'galaxy', 'romance', 'fantasy', 'dark', 'scifi'].map(key => [key, `assets/music/${key}.mp3`])));
  const LEVELS = Object.freeze({ intro: .22, galaxy: .40, romance: .40, fantasy: .20, dark: .21, scifi: .16 });
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const ease = value => value * value * (3 - 2 * value);

  class StellarMusic {
    constructor({ onError } = {}) {
      this.onError = onError;
      this._scene = 'galaxy';
      this._enabled = false;
      this._suspended = false;
      this._ducked = false;
      this._slots = [];
      this._positions = new Map();
      this._current = null;
      this._outgoing = null;
      this._version = 0;
      this._restartNext = false;
      this._level = 1;
      this._levelFade = null;
      this._sceneFade = null;
      this._raf = 0;
      this._tick = this._tick.bind(this);
      this._visibility = () => {
        if (document.hidden) this._pauseAll();
        else if (this._allowed()) this._activate(this._restartNext);
      };
      document.addEventListener('visibilitychange', this._visibility);
    }

    _allowed() { return this._enabled && !this._suspended && !document.hidden; }
    _normalLevel() { return this._ducked ? .28 : 1; }
    _wanted(slot) { return this._allowed() && (slot === this._current || slot === this._outgoing); }
    _remember(slot) {
      const position = slot.audio.currentTime;
      if (slot.key && slot.heard && Number.isFinite(position) && position >= 0) this._positions.set(slot.key, position);
    }
    _role(slot, role) { slot.audio.dataset.role = role; }
    _invalidatePlay(slot) { slot.playToken++; slot.pending = false; slot.started = false; }
    _quiet(slot) {
      this._remember(slot);
      this._invalidatePlay(slot);
      slot.gain = 0;
      slot.audio.volume = 0;
      slot.audio.pause();
      this._role(slot, 'standby');
    }
    _cancelFrames() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0; this._sceneFade = null; this._levelFade = null;
    }
    _pauseAll() {
      this._version++;
      this._cancelFrames();
      this._slots.forEach(slot => this._quiet(slot));
      this._outgoing = null;
      this._level = this._normalLevel();
      if (this._current) this._role(this._current, 'current');
    }
    _makeSlots() {
      if (this._slots.length || !this._allowed()) return false;
      for (const suffix of ['a', 'b']) {
        const audio = new Audio();
        audio.id = `background-music-${suffix}`;
        audio.dataset.scene = '';
        audio.dataset.role = 'standby';
        audio.setAttribute('aria-hidden', 'true');
        audio.preload = 'none'; audio.loop = true; audio.volume = 0;
        document.body.appendChild(audio);
        this._slots.push({ audio, key: null, gain: 0, loadToken: 0, playToken: 0, pending: false, started: false, seek: null, heard: false, unlocked: false, retryOnUnlocked: false });
      }
      return true;
    }

    setScene(key, { restart = false } = {}) {
      if (!Object.prototype.hasOwnProperty.call(TRACKS, key)) return this;
      const changed = key !== this._scene;
      if (!changed && !restart) return this;
      this._scene = key;
      this._restartNext = Boolean(restart || (changed && key !== 'galaxy'));
      if (restart) this._positions.set(key, 0);
      this._version++;
      if (this._allowed()) this._activate(this._restartNext);
      return this;
    }

    setEnabled(enabled) {
      this._enabled = Boolean(enabled);
      if (!this._enabled) { this._pauseAll(); return this; }
      if (!this._allowed()) return this;
      const created = this._makeSlots();
      this._activate(this._restartNext);
      // Invoke both play calls synchronously in the user's first gesture. The
      // silent standby call grants per-element media permission on mobile Safari.
      if (created) this._warmStandby();
      return this;
    }

    setDucked(ducked) {
      this._ducked = Boolean(ducked);
      const target = this._normalLevel();
      if (!this._allowed()) { this._level = target; return this; }
      this._levelFade = { from: this._level, to: target, start: performance.now(), duration: 320 };
      this._schedule();
      return this;
    }

    setSuspended(suspended) {
      const next = Boolean(suspended);
      if (this._suspended === next) return this;
      this._suspended = next;
      if (next) this._pauseAll();
      else if (this._allowed()) this._activate(this._restartNext);
      return this;
    }

    stop() { this._enabled = false; this._pauseAll(); return this; }

    _warmStandby() {
      const slot = this._slots.find(item => item !== this._current);
      if (!slot || !this._allowed()) return;
      const generation = ++slot.loadToken;
      slot.audio.src = TRACKS[this._scene];
      slot.audio.dataset.scene = this._scene;
      slot.audio.preload = 'auto'; slot.audio.volume = 0;
      const playToken = ++slot.playToken;
      try {
        Promise.resolve(slot.audio.play()).then(() => {
          slot.unlocked = true;
          if (!this._allowed()) { slot.audio.volume = 0; slot.audio.pause(); return; }
          if (slot.loadToken === generation && slot.playToken === playToken && !this._wanted(slot)) slot.audio.pause();
        }).catch(() => { /* Best-effort unlock; the active track owns error reporting. */ });
      } catch { /* Some browsers reject the optional standby play synchronously. */ }
    }

    _activate(restart = false) {
      if (!this._allowed()) return;
      this._makeSlots();
      const existing = this._slots.find(slot => slot.key === this._scene);
      if (existing === this._current && !restart && existing.started && !existing.audio.paused) return;
      this._cancelFrames();
      this._level = this._normalLevel();
      let incoming = existing;
      if (!incoming) {
        // Keep whichever element is actually audible during an interrupted fade.
        const audible = this._slots.slice().sort((a, b) => b.gain - a.gain)[0];
        incoming = this._slots.find(slot => slot !== audible);
        if (!audible.key || audible.audio.paused) incoming = this._current || this._slots[0];
      }
      const other = this._slots.find(slot => slot !== incoming);
      this._current = incoming;
      this._outgoing = other && other.key && !other.audio.paused && other.gain > 0 ? other : null;
      if (other && other !== this._outgoing) this._quiet(other);
      this._role(incoming, 'current');
      if (this._outgoing) this._role(this._outgoing, 'outgoing');
      const position = restart ? 0 : existing ? Math.max(0, existing.seek ?? existing.audio.currentTime ?? 0) : (this._positions.get(this._scene) || 0);
      const changed = incoming.key !== this._scene;
      if (changed || restart || incoming.audio.error) this._prepare(incoming, this._scene, position, changed || Boolean(incoming.audio.error));
      else {
        incoming.seek = position;
        this._applySeek(incoming);
      }
      this._restartNext = false;
      this._requestPlay(incoming, false);
    }

    _prepare(slot, key, position, loadSource = true) {
      if (slot.key !== key) this._remember(slot);
      this._invalidatePlay(slot);
      const generation = ++slot.loadToken;
      slot.audio.onloadedmetadata = slot.audio.ondurationchange = slot.audio.onerror = null;
      slot.audio.pause(); slot.audio.volume = 0; slot.gain = 0; slot.heard = false;
      slot.key = key; slot.audio.dataset.scene = key; slot.seek = position;
      this._positions.set(key, position);
      const metadata = () => {
        if (slot.loadToken !== generation) return;
        this._applySeek(slot);
        this._maybeFade(slot);
      };
      slot.audio.onloadedmetadata = metadata;
      slot.audio.ondurationchange = metadata;
      slot.audio.onerror = () => {
        if (slot.loadToken !== generation || !this._wanted(slot)) return;
        if (slot === this._outgoing) {
          this._quiet(slot); this._outgoing = null;
          if (this._sceneFade) { const index = this._slots.indexOf(slot); this._sceneFade.gains[index] = this._sceneFade.target[index] = 0; }
        } else this._fail(slot, 'media-error');
      };
      if (loadSource) { slot.audio.preload = 'auto'; slot.audio.src = TRACKS[key]; slot.audio.load(); }
      this._applySeek(slot);
    }

    _applySeek(slot) {
      if (slot.seek === null) return;
      if (slot.seek > 0 && slot.audio.readyState < 1) return;
      let position = slot.seek;
      if (Number.isFinite(slot.audio.duration) && slot.audio.duration > 0) position %= slot.audio.duration;
      try { slot.audio.currentTime = position; slot.seek = null; } catch { /* Metadata will retry the seek before the fade becomes audible. */ }
    }

    _requestPlay(slot, reused) {
      if (!this._wanted(slot) || slot.pending) return;
      const generation = slot.loadToken, token = ++slot.playToken;
      slot.pending = true; slot.started = false;
      let promise;
      try { promise = slot.audio.play(); }
      catch (error) { promise = Promise.reject(error); }
      Promise.resolve(promise).then(() => {
        slot.unlocked = true;
        if (!this._allowed()) { slot.audio.volume = 0; slot.audio.pause(); return; }
        if (slot.loadToken !== generation || slot.playToken !== token) {
          if (!this._wanted(slot)) { slot.audio.volume = 0; slot.audio.pause(); }
          return;
        }
        slot.pending = false;
        if (!this._wanted(slot)) { slot.audio.volume = 0; slot.audio.pause(); return; }
        slot.started = true;
        this._applySeek(slot);
        this._maybeFade(slot);
      }).catch(error => {
        if (slot.loadToken !== generation || slot.playToken !== token) return;
        slot.pending = false;
        if (!this._wanted(slot)) return;
        if (error && error.name === 'NotAllowedError' && !reused && this._outgoing?.unlocked) this._reuseUnlocked(slot);
        else this._fail(slot, error?.name || 'play-error');
      });
    }

    _maybeFade(slot) {
      if (slot !== this._current || !slot.started || slot.seek !== null || !this._allowed()) return;
      if (slot.fadeToken === slot.playToken) return;
      slot.fadeToken = slot.playToken;
      this._sceneFade = { start: performance.now(), duration: 1100, gains: this._slots.map(item => item.gain), target: this._slots.map(item => item === slot ? 1 : 0), version: this._version, complete: () => {
        const outgoing = this._outgoing;
        this._outgoing = null;
        if (outgoing && outgoing !== this._current) this._quiet(outgoing);
      } };
      this._schedule();
    }

    _reuseUnlocked(failed) {
      const reuse = this._outgoing;
      if (!reuse) { this._fail(failed, 'NotAllowedError'); return; }
      const scene = this._scene, version = this._version;
      const position = failed.seek === null ? failed.audio.currentTime : failed.seek;
      this._quiet(failed);
      this._current = reuse; this._outgoing = null;
      this._role(reuse, 'current');
      this._sceneFade = { start: performance.now(), duration: 220, gains: this._slots.map(item => item.gain), target: [0, 0], version, complete: () => {
        if (version !== this._version || !this._allowed()) return;
        this._prepare(reuse, scene, Math.max(0, position || 0), true);
        this._requestPlay(reuse, true);
      } };
      this._schedule();
    }

    _fail(slot, code) {
      if (!this._wanted(slot)) return;
      const scene = this._scene;
      this._pauseAll();
      this.onError?.({ scene, code, message: '这段背景音乐暂时无法播放，可切换场景或重新开启声音。' });
    }

    _schedule() { if (!this._raf && this._allowed()) this._raf = requestAnimationFrame(this._tick); }
    _tick(time) {
      this._raf = 0;
      if (!this._allowed()) { this._pauseAll(); return; }
      if (this._levelFade) {
        const fade = this._levelFade, progress = clamp((time - fade.start) / fade.duration);
        this._level = fade.from + (fade.to - fade.from) * ease(progress);
        if (progress === 1) this._levelFade = null;
      }
      let complete;
      if (this._sceneFade) {
        const fade = this._sceneFade;
        if (fade.version !== this._version) this._sceneFade = null;
        else {
          const progress = clamp((time - fade.start) / fade.duration), amount = ease(progress);
          this._slots.forEach((slot, index) => slot.gain = clamp(fade.gains[index] + (fade.target[index] - fade.gains[index]) * amount));
          if (progress === 1) { complete = fade.complete; this._sceneFade = null; }
        }
      }
      this._slots.forEach(slot => {
        slot.audio.volume = clamp(slot.gain * this._level * (LEVELS[slot.key] || 0));
        if (!slot.audio.paused && slot.audio.volume > .0001) slot.heard = true;
      });
      complete?.();
      if (this._sceneFade || this._levelFade) this._schedule();
    }
  }
  window.StellarMusic = StellarMusic;
})();
