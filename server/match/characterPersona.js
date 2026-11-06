import { characterContext } from '../companion/materials.js';

/** Shared evidence projection; card scripts and host instructions never execute. */
export function characterPersona(card, context = '') { return characterContext(card, context); }
