import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFixture, poseOf } from './camera-fixture.mjs';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, actual + ' differs from ' + expected);
const definitions = count => Array.from({ length: count }, (_, index) => ({ id: 'fixture-galaxy-' + index, color: '#63bce5', lit: true }));
const centerIndex = (fixture, group) => fixture.geometry('aGroup').values.lastIndexOf(group);
const center = (fixture, group) => {
  const offset = centerIndex(fixture, group) * 3;
  return fixture.geometry('aPosition').values.slice(offset, offset + 3);
};

for (const count of [1, 9, 10, 32]) {
  test(count + ' supplied galaxies all project, focus and finish their ignition', () => {
    const fixture = createCameraFixture({ galaxies: definitions(count) });
    const groups = fixture.geometry('aGroup').values;
    assert.deepEqual([...new Set(groups.filter(group => group > 0))], Array.from({ length: count }, (_, i) => i + 1));
    fixture.camera.setIgnition(0);
    for (let i = 0; i < count; i++) {
      assert.equal(fixture.camera.ignitionAt(i), 0);
      const p = fixture.camera.project(i);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
    fixture.camera.setIgnition(1);
    for (let i = 0; i < count; i++) assert.equal(fixture.camera.ignitionAt(i), 1);
    assert.equal(fixture.camera.project(count).visible, false);
    fixture.camera.setPose({ orientation: [.3, -.4, .25, .8], distance: 6, auto: false });
    fixture.camera.focus(count - 1); fixture.advance(400);
    const focused = fixture.camera.project(count - 1);
    assert.equal(focused.visible, true);
    near(focused.x, 50, 1e-5); near(focused.y, 50, 1e-5);
  });
}

test('mixed lit flags preserve array order and never ignite unvisited galaxies', () => {
  const galaxies = definitions(10).map((g, index) => ({ ...g, lit: [1, 5, 9].includes(index) }));
  const f = createCameraFixture({ galaxies }), groups = f.geometry('aGroup').values;
  assert.deepEqual([...new Set(groups.filter(group => group > 0))], [1, 2, 3]);
  for (const value of [0, .2, .7, 1]) {
    f.camera.setIgnition(value); f.frame();
    const uniforms = f.metrics.uniforms;
    let rank = 0;
    galaxies.forEach((galaxy, index) => {
      if (!galaxy.lit) {
        assert.equal(f.camera.ignitionAt(index), 0);
        const vertex = centerIndex(f, -index - 1);
        assert.ok(vertex >= 0, 'unvisited galaxy still has its own dim marker');
        assert.ok(f.geometry('aColor').values[vertex * 4 + 3] < .2);
        return;
      }
      const phase = value === 1 ? 1 : Math.max(0, Math.min(1, (value - rank * uniforms.uIgnitionStep) / uniforms.uIgnitionDuration));
      near(f.camera.ignitionAt(index), phase); rank++;
    });
  }
  f.camera.setIgnition(.4);
  assert.ok(f.camera.ignitionAt(1) > f.camera.ignitionAt(9), 'only visited entries determine ignition order');
});

test('explicit empty data never falls back to demo galaxies', () => {
  const f = createCameraFixture({ galaxies: [] }), pose = poseOf(f.camera);
  assert.ok(f.geometry('aGroup').values.every(group => group === 0));
  assert.equal(f.camera.project(0).visible, false);
  assert.equal(f.camera.ignitionAt(0), 0);
  f.camera.focus(0); f.frame();
  assert.deepEqual(poseOf(f.camera), pose);
});

test('per-galaxy colors are copied and uploaded with safe fallbacks', () => {
  const custom = Object.freeze([.2, .4, .6]);
  const colors = ['#f00', '#00ff00', 'rgb(0, 0, 255)', 'rgb(100% 0% 50%)', custom, 'invalid-color'];
  const galaxies = Object.freeze(colors.map((color, index) => Object.freeze({ id: 'color-' + index, color, lit: true })));
  const f = createCameraFixture({ galaxies }), buffer = f.geometry('aColor').values;
  [[1,0,0], [0,1,0], [0,0,1], [1,0,.5], [.2,.4,.6]].forEach((expected, index) => {
    const offset = centerIndex(f, index + 1) * 4;
    expected.forEach((value, channel) => near(buffer[offset + channel], value));
  });
  assert.ok(buffer.every(Number.isFinite));
});

test('additional galaxies stay separated and share a bounded particle budget', () => {
  const f = createCameraFixture({ galaxies: definitions(10) });
  const centers = Array.from({ length: 10 }, (_, i) => center(f, i + 1));
  for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) {
    assert.ok(Math.hypot(...centers[i].map((value, axis) => value - centers[j][axis])) > .5);
  }
  const many = createCameraFixture({ galaxies: definitions(64) });
  assert.ok(many.geometry('aPosition').values.length / 3 < 20000);
  assert.ok(centerIndex(many, 64) >= 0);
});

test('omitted options preserve the original six-anchor demo', () => {
  const f = createCameraFixture(), groups = f.geometry('aGroup').values;
  assert.deepEqual([...new Set(groups.filter(group => group > 0))], [1, 2, 3, 4]);
  assert.equal(f.camera.project(5).visible, true);
  assert.equal(f.camera.project(6).visible, false);
  near(f.metrics.uniforms.uIgnitionStep, .18);
  near(f.metrics.uniforms.uIgnitionDuration, .32);
  assert.equal(f.geometry('aPosition').values.length / 3, 14984);
});
