// public/js/render/fx/limits.js — shared fx tunables used by more than one effect module.

// Decorative sprites share a bounded budget; projectile and damage-number pools are independent.
const MAX_PARTICLES = { high: 900, medium: 540, low: 240 };

const SKILL_GOLD = 0xffd45a;

const NO_OPTS = Object.freeze({});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const easeOut = (t) => 1 - (1 - t) * (1 - t);

export { MAX_PARTICLES, SKILL_GOLD, NO_OPTS, clamp, easeOut };
