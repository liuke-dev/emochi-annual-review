import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFixture, poseOf, rotationDifference } from './camera-fixture.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const finiteUnitQuaternion = quaternion => {
  assert.ok(quaternion.every(Number.isFinite));
  near(Math.hypot(...quaternion), 1, 1e-10);
};

test('wheel pixel, line and page units produce equivalent zoom', () => {
  function zoom(deltaMode, deltaY) {
    const f = createCameraFixture();
    f.stage.emit('wheel', { deltaMode, deltaY }); f.advance(1200);
    return f.camera.distance;
  }
  near(zoom(0, 48), zoom(1, 3));
  near(zoom(0, 510), zoom(2, 1));
  assert.ok(zoom(0, -100) < 10.5 * .9, 'one meaningful wheel gesture must visibly zoom in');
});

test('input bursts submit at most one two-pass galaxy render per animation frame', () => {
  const f = createCameraFixture();
  for (let i = 0; i < 100; i++) f.stage.emit('wheel', { deltaY: i % 2 ? 1 : -2 });
  assert.equal(f.metrics.draws, 0, 'wheel handlers must only queue camera input');
  f.frame(); assert.equal(f.metrics.draws, 2);
  f.resetMetrics(); f.stage.emit('pointerdown');
  for (let i = 0; i < 100; i++) f.stage.emit('pointermove', { clientX: 110 + i });
  assert.equal(f.metrics.draws, 0, 'pointer handlers must not draw synchronously');
  f.frame(); assert.equal(f.metrics.draws, 2); assert.equal(f.metrics.poses, 1);
  assert.equal(f.metrics.captures, 1, 'capture is acquired once, not on each move');
});

test('zoom responds on the next frame, settles promptly and respects both limits', () => {
  const f = createCameraFixture(), reference = createCameraFixture();
  f.stage.emit('wheel', { deltaY: -100 }); reference.stage.emit('wheel', { deltaY: -100 });
  near(f.camera.distance, 10.5);
  f.frame(); assert.ok(f.camera.distance < 10.5);
  f.advance(250); reference.advance(2000);
  assert.ok(Math.abs(f.camera.distance - reference.camera.distance) / reference.camera.distance < .02);
  for (let i = 0; i < 10; i++) f.stage.emit('wheel', { deltaY: -1000 });
  f.advance(2000); near(f.camera.distance, 4.5, 1e-4);
  for (let i = 0; i < 10; i++) f.stage.emit('wheel', { deltaY: 1000 });
  f.advance(2000); near(f.camera.distance, 28, 1e-4);
});

test('horizontal and vertical camera circles cross poles and preserve a valid orientation', () => {
  const f = createCameraFixture();
  f.camera.setCamera(0, 0); const original = poseOf(f.camera).orientation;
  for (const axis of ['horizontal', 'vertical']) {
    let opposite = false;
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      f.camera.setCamera(axis === 'horizontal' ? angle : 0, axis === 'vertical' ? angle : 0); f.frame();
      const q = poseOf(f.camera).orientation; finiteUnitQuaternion(q);
      if (rotationDifference(q, original) > 3) opposite = true;
    }
    assert.ok(opposite, `${axis} orbit must reach the far side`);
    near(rotationDifference(poseOf(f.camera).orientation, original), 0, 1e-7);
  }
  // Exercise actual input across the former vertical clamp, not just setters.
  f.camera.setCamera(0, 0); f.frame(); f.stage.emit('pointerdown', { clientY: 100 });
  let crossed = false;
  for (let i = 1; i <= 80; i++) {
    f.stage.emit('pointermove', { clientY: 100 + i * 13 }); f.frame();
    const q = poseOf(f.camera).orientation; finiteUnitQuaternion(q);
    if (rotationDifference(q, original) > 3) crossed = true;
  }
  assert.ok(crossed, 'vertical dragging must cross the pole without the former pitch clamp');
});

test('full pose restores roll exactly and is independent of the caller array', () => {
  const f = createCameraFixture();
  const input = [.33, -.41, .28, .8], magnitude = Math.hypot(...input);
  f.camera.setPose({ orientation: input.map(value => value / magnitude), distance: 9.1, auto: false }); f.frame();
  const saved = poseOf(f.camera);
  f.camera.setCamera(2.3, -1.7); f.camera.zoomBy(.6); f.advance(300);
  f.camera.setPose(saved); f.frame();
  assert.deepEqual(poseOf(f.camera), saved);
  saved.orientation[0] = 999;
  finiteUnitQuaternion(poseOf(f.camera).orientation);
});

test('pinch captures both fingers, ignores a third and rebases cleanly to one finger', () => {
  const f = createCameraFixture();
  f.stage.emit('pointerdown', { pointerId: 1, clientX: 100 });
  f.stage.emit('pointerdown', { pointerId: 2, clientX: 200 });
  assert.deepEqual([...f.stage.captured].sort(), [1, 2]);
  f.stage.emit('pointerdown', { pointerId: 3, clientX: 300 });
  const beforeThird = poseOf(f.camera);
  f.stage.emit('pointermove', { pointerId: 3, clientX: 900 }); f.frame();
  assert.deepEqual(poseOf(f.camera), beforeThird);
  f.stage.emit('pointermove', { pointerId: 2, clientX: 250 }); f.frame();
  near(f.camera.distance, 7);
  f.stage.emit('pointerup', { pointerId: 2, clientX: 250 });
  const rebased = poseOf(f.camera);
  f.stage.emit('pointermove', { pointerId: 1, clientX: 100 }); f.frame();
  assert.deepEqual(poseOf(f.camera), rebased, 'lifting a pinch finger must not rotate or jump');
  f.window.emit('pointerup', { pointerId: 1 });
  assert.equal(f.camera.pointers.size, 0); assert.equal(f.stage.captured.size, 0);
  assert.equal(f.metrics.dragEnds, 1, 'suppress the gesture click only after the complete gesture');
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'inactive', 'hidden', 'blur', 'flat']) {
  test(`${interruption} clears the active gesture and stale movement cannot change the camera`, () => {
    const f = createCameraFixture();
    f.stage.emit('pointerdown'); f.stage.emit('pointermove', { clientX: 180 }); f.frame();
    f.stage.emit('pointermove', { clientX: 220 }); // Pending input must also be discarded.
    if (interruption === 'inactive') f.camera.setActive(false);
    else if (interruption === 'hidden') f.setHidden(true);
    else if (interruption === 'flat') f.camera.setFlat(true);
    else if (interruption === 'blur') f.window.emit('blur');
    else f.stage.emit(interruption);
    assert.equal(f.camera.pointers.size, 0); assert.equal(f.stage.captured.size, 0);
    assert.equal(f.stage.classList.contains('dragging'), false);
    const pose = poseOf(f.camera);
    f.resetMetrics(); f.stage.emit('pointermove', { clientX: 900 }); f.advance(250);
    assert.deepEqual(poseOf(f.camera), pose);
    if (interruption === 'inactive' || interruption === 'hidden') assert.equal(f.metrics.draws, 0);
  });
}

test('capture transfer from a beacon button does not cancel the stage drag', () => {
  const f = createCameraFixture(), button = { closest: () => null };
  f.stage.emit('pointerdown', { target: button });
  f.stage.emit('pointermove', { target: button, clientX: 180 });
  f.stage.emit('lostpointercapture', { target: button });
  assert.equal(f.camera.pointers.size, 1);
  assert.equal(f.metrics.dragEnds, 0);
  assert.ok(f.stage.captured.has(1));
  f.frame(); const before = poseOf(f.camera).orientation;
  f.stage.emit('pointermove', { clientX: 220 }); f.frame();
  assert.ok(rotationDifference(before, poseOf(f.camera).orientation) > .01);
  f.stage.emit('lostpointercapture');
  assert.equal(f.camera.pointers.size, 0); assert.equal(f.metrics.dragEnds, 1);
});

test('an unmoved tap keeps click handling available and reduced motion does not redraw endlessly', () => {
  const f = createCameraFixture({ reduced: true });
  f.stage.emit('pointerdown'); f.stage.emit('pointerup');
  assert.equal(f.metrics.dragEnds, 0);
  f.resetMetrics(); f.advance(2000); assert.equal(f.metrics.draws, 0);
});

test('manual wheel input cancels a focus flight without a later camera snap', () => {
  const f = createCameraFixture(); f.camera.focus(1); f.advance(100);
  const interrupted = poseOf(f.camera), reference = createCameraFixture();
  reference.camera.setPose(interrupted); reference.frame();
  f.stage.emit('wheel', { deltaY: 48 }); reference.stage.emit('wheel', { deltaY: 48 });
  f.advance(1000); reference.advance(1000);
  near(f.camera.distance, reference.camera.distance);
  near(rotationDifference(poseOf(f.camera).orientation, poseOf(reference.camera).orientation), 0, 1e-7);
});

test('focus centers the selected beacon from a rolled camera pose', () => {
  const f = createCameraFixture();
  for (let index = 0; index < 4; index++) {
    f.camera.setPose({ orientation: [.3, -.4, .25, .8], distance: 6, auto: false });
    f.camera.focus(index); f.advance(400);
    const beacon = f.camera.project(index);
    assert.equal(beacon.visible, true);
    near(beacon.x, 50, 1e-5); near(beacon.y, 50, 1e-5);
    finiteUnitQuaternion(poseOf(f.camera).orientation);
  }
});

test('label projection agrees with the uploaded camera matrix, viewport and near-plane convention', () => {
  const f = createCameraFixture();
  const positions = f.geometry('aPosition').values, groups = f.geometry('aGroup').values;
  // The final point in each luminous genre group is its central beacon.
  const centers = [1, 2, 3, 4].map(group => positions.slice(groups.lastIndexOf(group) * 3, groups.lastIndexOf(group) * 3 + 3));
  let invisible = 0;
  for (const distance of [4.5, 10.5, 28]) for (const [yaw, pitch] of [[0, 0], [1.4, -1.9], [-6.5, 3.7], [2.8, 1.3]]) {
    f.camera.setCamera(yaw, pitch); f.camera.distance = distance; f.frame();
    const u = f.metrics.uniforms, m = u.uRotationMatrix, [width, height] = u.uResolution;
    centers.forEach((point, index) => {
      const rotated = [0, 1, 2].map(row => point.reduce((sum, value, column) => sum + m[column * 3 + row] * value, 0));
      const depth = u.uDistance - rotated[2], perspective = 10.5 / Math.max(.35, depth);
      const x = (0.5 + rotated[0] * u.uScale * perspective / width) * 100;
      const y = (0.5 - rotated[1] * u.uScale * perspective / height) * 100;
      const projected = f.camera.project(index);
      assert.ok(Number.isFinite(projected.x) && Number.isFinite(projected.y));
      near(projected.x, x, 1e-5); near(projected.y, y, 1e-5);
      assert.equal(projected.visible, depth > .35 && x >= 0 && x <= 100 && y >= 0 && y <= 100);
      if (!projected.visible) invisible++;
    });
  }
  assert.ok(invisible > 0, 'the closest camera cases must exercise clipped beacon labels');
});
