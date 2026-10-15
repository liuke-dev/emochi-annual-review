import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

// Deterministic browser/GL boundary for input and camera contracts. It counts
// actual draw submissions and records uploaded geometry/uniforms; it does not
// claim to compile shaders or measure GPU frame time.
export function createCameraFixture({ width = 390, height = 510, reduced = false, galaxies } = {}) {
  let now = 0, nextFrame = 0, boundBuffer;
  const scheduled = new Map(), buffers = new Map(), attributes = new Map();
  const metrics = { draws: 0, poses: 0, zooms: 0, dragEnds: 0, captures: 0, releases: 0, uniforms: {} };
  function surface() {
    const listeners = new Map(), classes = new Set(), captured = new Set();
    return {
      clientWidth: width, clientHeight: height, width, height, captured,
      style: { setProperty() {} },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
      removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(item => item !== callback)); },
      emit(name, values = {}) {
        const event = { type: name, target: this, button: 0, buttons: 1, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, deltaX: 0, deltaY: 0, deltaMode: 0, timeStamp: now, preventDefault() {}, ...values };
        for (const callback of [...(listeners.get(name) || [])]) callback(event);
      },
      closest() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, width, height }; },
      setPointerCapture(id) { captured.add(id); metrics.captures++; },
      hasPointerCapture(id) { return captured.has(id); },
      releasePointerCapture(id) { captured.delete(id); metrics.releases++; }
    };
  }
  const upload = (name, value) => { metrics.uniforms[name] = ArrayBuffer.isView(value) ? Array.from(value) : value; };
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getShaderPrecisionFormat: () => ({ precision: 23 }),
    getUniformLocation: (_, name) => name, getAttribLocation: (_, name) => name,
    bindBuffer: (_, buffer) => { boundBuffer = buffer; },
    bufferData: (_, data) => buffers.set(boundBuffer, Array.from(data)),
    vertexAttribPointer: (name, components) => attributes.set(name, { components, buffer: boundBuffer }),
    uniform1f: upload, uniform1i: upload,
    uniform2f: (name, x, y) => upload(name, [x, y]),
    uniformMatrix3fv: (name, _, matrix) => upload(name, matrix),
    drawArrays: () => metrics.draws++
  }, { get(object, property) { if (property in object) return object[property]; return /^[A-Z_\d]+$/.test(String(property)) ? 1 : () => {}; } });
  const stage = surface(), canvas = surface(), document = { ...surface(), hidden: false };
  canvas.getContext = () => gl;
  const window = surface();
  const requestAnimationFrame = callback => { const id = ++nextFrame; scheduled.set(id, callback); return id; };
  const cancelAnimationFrame = id => scheduled.delete(id);
  const context = { window, document, devicePixelRatio: 2, innerWidth: width, innerHeight: height,
    performance: { now: () => now }, matchMedia: () => ({ matches: reduced }), requestAnimationFrame, cancelAnimationFrame, console };
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame, matchMedia: context.matchMedia });
  vm.createContext(context);
  const publicSource = new URL('../public/galaxy.js', import.meta.url);
  const source = existsSync(publicSource) ? publicSource : new URL('../dist/galaxy.js', import.meta.url);
  vm.runInContext(readFileSync(source, 'utf8'), context);
  const camera = new window.StellarGalaxy(canvas, stage, {
    onPose: () => metrics.poses++, onZoom: () => metrics.zooms++, onDragEnd: () => metrics.dragEnds++, galaxies
  });
  camera.setAuto(false);
  function frame(milliseconds = 1000 / 60) {
    now += milliseconds;
    const callbacks = [...scheduled.values()]; scheduled.clear();
    for (const callback of callbacks) callback(now);
  }
  function advance(milliseconds) { const count = Math.max(1, Math.ceil(milliseconds / (1000 / 60))); for (let i = 0; i < count; i++) frame(milliseconds / count); }
  function resetMetrics() { for (const key of Object.keys(metrics)) if (key !== 'uniforms') metrics[key] = 0; }
  function setHidden(hidden) { document.hidden = hidden; document.emit('visibilitychange'); }
  function geometry(name) { const attribute = attributes.get(name); return { components: attribute.components, values: buffers.get(attribute.buffer) }; }
  frame(); resetMetrics();
  return { camera, stage, canvas, window, document, metrics, frame, advance, resetMetrics, setHidden, geometry };
}

export const poseOf = camera => JSON.parse(JSON.stringify(camera.getPose()));
export const rotationDifference = (left, right) => {
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
  return 2 * Math.acos(Math.min(1, dot));
};
