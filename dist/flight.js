/* Stellar Echo — original procedural nebula flight. No external textures or libraries. */
(function () {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const ease = value => value * value * (3 - 2 * value);

  class StellarFlight {
    constructor(canvas, { onLandingProgress } = {}) {
      if (!canvas) throw new Error('Flight canvas is missing');
      this.canvas = canvas;
      this.onLandingProgress = onLandingProgress;
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._running = false;
      this._landing = false;
      this._landingProgress = 0;
      this._landingProgressStart = 0;
      this._travel = 0;
      this._elapsed = 0;
      this._quality = 1;
      this._slowFrames = 0;
      this._lastTime = null;
      this._lastDraw = null;
      this._raf = 0;
      const gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, powerPreference: 'low-power'
      });
      if (!gl) throw new Error('Flight WebGL unavailable');
      this.gl = gl;
      const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const precision = high && high.precision > 0 ? 'highp' : 'mediump';
      const vertex = `
        attribute vec2 aPosition;
        varying mediump vec2 vUv;
        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;
      const fragment = `
        precision ${precision} float;
        varying mediump vec2 vUv;
        uniform vec2 uResolution;
        uniform float uTravel;
        uniform float uTime;
        uniform float uArrival;
        uniform float uReduced;
        uniform float uSteps;

        // A small value-noise volume creates clouds with continuous depth.
        float seed(vec3 p) {
          p = fract(p * vec3(0.137, 0.173, 0.193));
          p += dot(p, p.yzx + 23.47);
          return fract((p.x + p.z) * p.y);
        }
        float volumeNoise(vec3 p) {
          vec3 cell = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = mix(seed(cell), seed(cell + vec3(1,0,0)), f.x);
          float b = mix(seed(cell + vec3(0,1,0)), seed(cell + vec3(1,1,0)), f.x);
          float c = mix(seed(cell + vec3(0,0,1)), seed(cell + vec3(1,0,1)), f.x);
          float d = mix(seed(cell + vec3(0,1,1)), seed(cell + vec3(1,1,1)), f.x);
          return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
        }

        void main() {
          float aspect = uResolution.x / max(1.0, uResolution.y);
          vec2 screen = (vUv - 0.5) * 2.0;
          screen.x *= aspect;
          // Subtle drift only; no whole-screen rotation or pulsing exposure.
          screen -= vec2(sin(uTime * 0.031), cos(uTime * 0.027)) * 0.012 * (1.0-uReduced);
          vec3 ray = normalize(vec3(screen * 1.18, 1.65));
          vec3 light = vec3(0.0);
          float transmission = 1.0;
          float stepLength = 15.0 / uSteps;

          for (int i = 0; i < 32; i++) {
            if (float(i) >= uSteps) break;
            float depth = 0.7 + (float(i) + 0.5) * stepLength;
            vec3 p = ray * depth;
            p.z += uTravel;
            float bend = 0.12 * sin(p.z * 0.22);
            p.xy -= vec2(bend, 0.09 * cos(p.z * 0.18));
            float broad = volumeNoise(vec3(p.xy * 1.25, p.z * 0.31));
            float detail = volumeNoise(vec3(p.xy * 4.1 + broad * 1.7, p.z * 0.92));
            float radius = 1.42 + 0.28 * (broad - 0.5) + 0.1 * sin(p.z * 0.42);
            float wallDistance = (length(p.xy) - radius) * 1.48;
            float wall = exp(-wallDistance * wallDistance);
            float wisps = smoothstep(0.32, 0.88, broad * 0.64 + detail * 0.36);
            float density = wall * (0.055 + wisps * 0.60);
            density *= smoothstep(0.8, 2.0, depth) * (1.0-smoothstep(12.0, 16.0, depth));
            float alpha = 1.0 - exp(-density * stepLength * 0.65);
            float tint = smoothstep(0.22, 0.77, broad + p.x * 0.08);
            vec3 cloud = mix(vec3(0.32,0.10,0.64), vec3(0.12,0.65,0.78), tint);
            cloud += vec3(0.25,0.30,0.37) * pow(detail, 5.0);
            light += transmission * alpha * cloud * 1.45;
            transmission *= 1.0-alpha;
          }

          // A few thin points elongate into streaks; the cloud volume remains dominant.
          float radial = length(screen);
          float sector = (atan(screen.y, screen.x) + 3.141593) * 17.825;
          float id = floor(sector);
          float starSeed = seed(vec3(id, 8.0, 3.0));
          float strand = 1.0-smoothstep(0.006, 0.026, abs(fract(sector)-0.5));
          float head = 0.13 + fract(starSeed + uTravel * 0.047) * 1.22;
          float streakLength = mix(0.065, 0.016, uReduced) * (0.4 + starSeed);
          float streak = strand * smoothstep(head-streakLength,head,radial)
            * (1.0-smoothstep(head,head+0.009,radial)) * step(0.78,starSeed);
          streak *= 0.24 * (1.0-smoothstep(0.0,0.8,uArrival));
          light += vec3(0.40,0.60,0.82)*streak;

          // Remove the dark backdrop early; later cloud wisps reveal the live galaxy below.
          float backdrop = 1.0-smoothstep(0.28,0.70,uArrival);
          float front = smoothstep(0.36,0.98,uArrival) * 1.65 - 0.22;
          float dissolve = smoothstep(front-0.17,front+0.17,radial);
          float cloudFade = dissolve * (1.0-smoothstep(0.64,1.0,uArrival));
          float cloudAlpha = clamp(1.0-transmission+streak,0.0,1.0)*cloudFade;
          float alpha = backdrop + cloudAlpha*(1.0-backdrop);
          vec3 base = vec3(0.008,0.012,0.030);
          vec3 color = base*backdrop + light*cloudFade;
          gl_FragColor = vec4(clamp(color,vec3(0.0),vec3(alpha)),alpha);
        }
      `;
      const shaders = [];
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw new Error('Flight shader: ' + message);
        }
        shaders.push(shader);
        return shader;
      };
      try {
        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
          throw new Error('Flight program: ' + gl.getProgramInfoLog(this.program));
        }
      } catch (error) {
        if (this.program) gl.deleteProgram(this.program);
        throw error;
      } finally {
        shaders.forEach(shader => gl.deleteShader(shader));
      }
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      this.position = gl.getAttribLocation(this.program, 'aPosition');
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      ['Resolution','Travel','Time','Arrival','Reduced','Steps'].forEach(name => {
        this.uniforms[name] = gl.getUniformLocation(this.program, 'u' + name);
      });
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0,0,0,0);
      this._tick = this._tick.bind(this);
      this._onVisibility = () => { this._lastTime = null; this._lastDraw = null; };
      document.addEventListener('visibilitychange', this._onVisibility);
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.stop();
        canvas.dispatchEvent(new CustomEvent('flight-unavailable'));
      });
      this.resize();
    }

    get landingProgress() { return this._landingProgress; }

    start() {
      cancelAnimationFrame(this._raf);
      if (this.gl.isContextLost()) throw new Error('Flight context lost');
      this._running = true;
      this._landing = false;
      this._landingProgress = 0;
      this._landingProgressStart = 0;
      this._landingElapsed = 0;
      this._elapsed = 0;
      this._travel = 0;
      this._slowFrames = 0;
      this._lastTime = null;
      this._lastDraw = null;
      this.resize();
      this.onLandingProgress?.(0);
      this._raf = requestAnimationFrame(this._tick);
    }

    beginLanding(durationMs = 7000) {
      if (this._landingProgress === 1) return;
      if (!this._running) this.start();
      const duration = Number.isFinite(durationMs) ? Math.max(1, durationMs) : 7000;
      if (this._landing && duration >= this._landingDuration-this._landingElapsed) return;
      // A skip shortens the remaining flight from the existing visual position.
      this._landingProgressStart = this._landingProgress;
      this._landingDuration = duration;
      this._landingElapsed = 0;
      this._landing = true;
    }

    stop() {
      this._running = false;
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._lastTime = null;
      if (!this.gl.isContextLost()) this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, this.canvas.clientWidth || bounds.width || 1);
      this.height = Math.max(1, this.canvas.clientHeight || bounds.height || 1);
      const dpr = Math.min(1, window.devicePixelRatio || 1) * this._quality;
      this.canvas.width = Math.max(1, Math.round(this.width * dpr));
      this.canvas.height = Math.max(1, Math.round(this.height * dpr));
      this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      if (this._running) this._draw();
    }

    _draw() {
      const gl = this.gl, u = this.uniforms;
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,0,0);
      gl.uniform2f(u.Resolution,this.width,this.height);
      gl.uniform1f(u.Travel,this.reduced ? 0 : this._travel);
      gl.uniform1f(u.Time,this.reduced ? 0 : this._elapsed);
      gl.uniform1f(u.Arrival,this._landingProgress);
      gl.uniform1f(u.Reduced,this.reduced ? 1 : 0);
      gl.uniform1f(u.Steps,this.width <= 540 ? 28 : 32);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }

    _tick(now) {
      if (!this._running) return;
      if (document.hidden) {
        this._lastTime = null;
        this._lastDraw = null;
        this._raf = requestAnimationFrame(this._tick);
        return;
      }
      const frameMs = this._lastTime === null ? 0 : now-this._lastTime;
      const delta = clamp(frameMs / 1000,0,0.08);
      this._lastTime = now;
      this._elapsed += delta;
      if (this._landing) {
        // Arrival follows visible wall time even when a low-power device misses frames.
        this._landingElapsed += Math.max(0,frameMs);
        const portion = clamp(this._landingElapsed / this._landingDuration,0,1);
        this._landingProgress = this._landingProgressStart + (1-this._landingProgressStart)*portion;
      }
      const speed = this._landing ? Math.pow(1-ease(this._landingProgress),2) : 1;
      this._travel += delta*0.36*speed;
      if (frameMs > 42 && frameMs < 250) this._slowFrames++;
      else this._slowFrames = Math.max(0,this._slowFrames-0.25);
      if (this._slowFrames > 25 && this._quality > 0.7) {
        this._quality = Math.max(0.7,this._quality-0.15);
        this._slowFrames = 0;
        this.resize();
      }
      const interval = this.reduced && !this._landing ? 250 : 32;
      if (this._lastDraw === null || now-this._lastDraw >= interval || this._landingProgress === 1) {
        this._lastDraw = now;
        this._draw();
        if (this._landing) this.onLandingProgress?.(this._landingProgress);
      }
      if (this._landingProgress === 1) {
        this._running = false;
        this._raf = 0;
        return;
      }
      this._raf = requestAnimationFrame(this._tick);
    }
  }
  window.StellarFlight = StellarFlight;
})();
