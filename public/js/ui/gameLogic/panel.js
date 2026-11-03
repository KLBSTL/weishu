// ui/gameLogic/panel.js — detail card and bond popup placement. Re-exported from ../gameLogic.js.

import { isObj } from './shared.js';


// ---- detail panel placement (user playtest #2 item 8) ---------------------------------------------------------------

/**
 * Which side the detail panel goes to so it never covers the selected unit's underframe: the default 'left' panel
 * unless the underframe (buttons included) overlaps it and the 'right' slot is clear of it (else 'left' — the
 * underframe is drawn above the panel anyway, css z-index).
 * @param {{ left: number, right: number, top: number, bottom: number }|null} uf underframe rect (client px)
 * @param {{ left: {left:number,right:number,top:number,bottom:number}, right: {left:number,right:number,top:number,bottom:number} }} slots
 * @returns {'left'|'right'}
 */
export function panelSide(uf, slots) {
  if (!isObj(uf) || !isObj(slots)) return 'left';
  const hit = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  if (!hit(uf, slots.left)) return 'left';
  return hit(uf, slots.right) ? 'left' : 'right';
}

/**
 * Client-px rects of the detail slots in interface.css, including readable pixel floors and compact layouts.
 * The shop scrolls alongside an open panel, so opening it does not shorten the right slot.
 * @param {{ width: number, height: number, left?: number, top?: number }} vp the HUD layer's box (.gm__hud): its size,
 *   and its client offset — the HUD sits inside the safe-area insets (css/devices.css), so on a notched phone the
 *   panels start `left` / `top` px further in than the viewport edge (default 0: the whole viewport)
 * @param {number} rem root font size (px)
 * @param {{ shopOpen?: boolean }} [_o]
 */
export function panelSlots(vp, rem, _o = {}) {
  const W = Number(vp?.width) || 1920;
  const H = Number(vp?.height) || 1080;
  const X = Number.isFinite(vp?.left) ? vp.left : 0;
  const Y = Number.isFinite(vp?.top) ? vp.top : 0;
  const R = rem > 0 ? rem : 100;
  const compact = W <= 900 || H <= 520;
  const top = compact ? 66 : R * 2.1;
  const width = Math.min(W - 24, Math.max(320, R * 4.9));
  const gap = compact ? 8 : 12;
  const bottom = Math.max(top, H - (compact ? 48 : Math.max(48, R * 1.02)));
  return {
    left: { left: X + 12, right: X + 12 + width, top: Y + top, bottom: Y + bottom },
    right: { left: X + W - gap - width, right: X + W - gap, top: Y + top, bottom: Y + bottom },
  };
}
/** Legacy rem constants retained for consumers of the original stylesheet; panelSlots uses interface.css above. */
export const PANEL_RIGHT_GAP = 0.9;
export const PANEL_RIGHT_BOTTOM = 1.02;
export const PANEL_RIGHT_BOTTOM_SHOP = 3.78;

/** Bond popup geometry; rem width/top/bottom, pixel minimum and gaps (interface.css). */
export const BPOP = Object.freeze({ width: 4.9, minWidth: 330, top: 2.1, bottomGap: 0.3, left: 12, gap: 12, right: 12 });

export function bondPopupSlots(vp, rem) {
  const W = Number(vp?.width) || 1920, H = Number(vp?.height) || 1080;
  const X = Number.isFinite(vp?.left) ? vp.left : 0, Y = Number.isFinite(vp?.top) ? vp.top : 0;
  const R = rem > 0 ? rem : 100, compact = W <= 900 || H <= 520;
  const width = Math.min(W - 24, Math.max(BPOP.minWidth, R * BPOP.width));
  const panels = panelSlots(vp, R);
  const top = Y + (compact ? 66 : R * BPOP.top);
  const bottom = Y + H - (compact ? 48 : R * BPOP.bottomGap);
  const box = left => ({ left, right: left + width, top, bottom });
  return {
    left: box(X + BPOP.left), right: box(X + W - (compact ? 8 : BPOP.right) - width),
    beside: box(panels.left.right + BPOP.gap), besideR: box(panels.right.left - BPOP.gap - width),
  };
}

/**
 * Where the bond popup opens (css .bpop--<place>) so it neither hides the open detail card nor covers the selected
 * unit's underframe (user playtest #2 items 8 / 9): next to the card first ('beside' the left card, 'besideR' left of
 * the right card), else the free side of the screen, else over the
 * card it was opened from; without a card the popup's usual place is 'left'. Slots must fit the viewport. When every candidate covers the
 * underframe the first one is kept (the underframe is drawn above the popup, css z-index).
 * @param {{ left: number, right: number, top: number, bottom: number }|null} uf underframe rect (client px) or null
 * @param {{ width: number, height: number, left?: number, top?: number }} vp the HUD layer's box (see panelSlots)
 * @param {number} rem root font size (px)
 * @param {'left'|'right'|null} card side of the open detail card (null: none)
 * @returns {'left'|'beside'|'besideR'|'right'}
 */
export function bondPopupPlace(uf, vp, rem, card = null) {
  const W = Number(vp?.width) || 1920;
  const X = Number.isFinite(vp?.left) ? vp.left : 0;
  const R = rem > 0 ? rem : 100;
  const slots = bondPopupSlots(vp, R);
  const panel = card ? panelSlots(vp, R)[card] : null;
  // last resort: over the card it was opened from (closing the popup shows the card again)
  const order = card === 'left' ? ['beside', 'right', 'left'] : card === 'right' ? ['besideR', 'left', 'right'] : ['left', 'right'];
  const hit = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const fits = order.filter(p => slots[p].left >= X && slots[p].right <= X + W);
  const clear = fits.filter(p => p === card || !hit(panel, slots[p]));
  return clear.find(p => !hit(isObj(uf) ? uf : null, slots[p])) || clear[0] || fits[0] || order.at(-1);
}
