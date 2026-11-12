import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const scope = {};
runInNewContext(readFileSync(new URL('../server/companion/motion.js', import.meta.url), 'utf8'), scope);
const { Spring, Pendulum } = scope.ArkMotion;
test('panel spring follows input without discontinuity and reaches a true resting state', () => {
  const spring = new Spring(); spring.target = 700;
  for (let i = 0; i < 20; i++) spring.step(1 / 60);
  assert.ok(spring.value > 0 && spring.value < 700);
  const before = spring.value; spring.target = 0; spring.step(1 / 60);
  assert.ok(Math.abs(spring.value - before) < 100);
  for (let i = 0; i < 300; i++) spring.step(1 / 60);
  assert.equal(spring.step(1 / 60), false); assert.equal(spring.value, 0);
});
test('pendant responds to inertia, reverses under gravity, remains bounded and sleeps after damping', () => {
  const p = new Pendulum(); p.kick(80);
  let positive = false, negative = false, rest = false;
  for (let i = 0; i < 1200; i++) {
    rest = !p.step(1 / 60); positive ||= p.angle > .02; negative ||= p.angle < -.005;
    assert.ok(Number.isFinite(p.angle) && Math.abs(p.angle) <= Math.PI / 10 + .00001);
  }
  assert.ok(positive && negative && rest); assert.equal(p.velocity, 0);
  p.kick(1000000); p.step(600); assert.ok(Number.isFinite(p.angle));
});
test('rope lengths change the oscillation and reduced motion immediately settles all state', () => {
  const a = new Pendulum(), b = new Pendulum(); a.length = 60; b.length = 200; a.velocity = b.velocity = 1;
  for (let i = 0; i < 20; i++) { a.step(1 / 60); b.step(1 / 60); }
  assert.notEqual(a.angle, b.angle); a.step(1, true); assert.equal(a.angle, 0); assert.equal(a.velocity, 0);
  const s = new Spring(); s.target = 800; s.step(1, true); assert.equal(s.value, 800); assert.equal(s.velocity, 0);
});
