/* global window, document */
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  class Spring {
    constructor(value = 0, frequency = 18) { this.value = value; this.target = value; this.velocity = 0; this.frequency = frequency; }
    step(dt, reduced = false) {
      if (reduced) { this.value = this.target; this.velocity = 0; return false; }
      dt = clamp(dt, 0, .04);
      const w = this.frequency, d = this.value - this.target, c = this.velocity + w * d, e = Math.exp(-w * dt);
      this.value = this.target + (d + c * dt) * e; this.velocity = (this.velocity - w * c * dt) * e;
      if (Math.abs(this.value - this.target) < .08 && Math.abs(this.velocity) < .5) { this.value = this.target; this.velocity = 0; return false; }
      return true;
    }
  }
  class Pendulum {
    constructor() { this.angle = 0; this.velocity = 0; this.length = 120; this.limit = Math.PI / 10; }
    kick(pixels) { this.velocity = clamp(this.velocity + pixels / Math.max(40, this.length) * 2, -2.8, 2.8); }
    step(dt, reduced = false) {
      if (reduced) { this.angle = this.velocity = 0; return false; }
      const count = Math.max(1, Math.ceil(Math.min(.04, Math.max(0, dt)) * 120)), h = Math.min(.04, Math.max(0, dt)) / count;
      for (let i = 0; i < count; i++) {
        this.velocity += (-1250 / Math.max(40, this.length) * Math.sin(this.angle) - 2.3 * this.velocity) * h;
        this.angle += this.velocity * h;
        if (Math.abs(this.angle) > this.limit) { this.angle = clamp(this.angle, -this.limit, this.limit); this.velocity *= -.25; }
      }
      if (Math.abs(this.angle) < .0005 && Math.abs(this.velocity) < .002) { this.angle = this.velocity = 0; return false; }
      return true;
    }
  }
  const transitions = new WeakMap(), active = new Set();
  const cancelAll = () => { for (const animation of active) animation.cancel(); active.clear(); };
  const reduced = () => document.body.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function enter(element, direction = 1) {
    transitions.get(element)?.cancel();
    if (!element?.animate || reduced()) return;
    const animation = element.animate([{ opacity: .25, transform: `translate3d(${direction * 10}px,3px,0)` },
      { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' });
    transitions.set(element, animation);
    active.add(animation);
    const cleanup = () => { active.delete(animation); if (transitions.get(element) === animation) transitions.delete(element); };
    animation.finished.then(cleanup, cleanup);
  }
  if (typeof window !== 'undefined') window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { if (e.matches) cancelAll(); });
  globalThis.ArkMotion = { Spring, Pendulum, enter, reduced, cancelAll };
})();
