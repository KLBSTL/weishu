// Delegated paper motion and optional card sounds.
import { audio } from '../audio.js';
import { paperStyleActive } from './gameLogic/settings.js';

const CONTROL = 'button,[role="button"],[role="tab"],[role="radio"],[role="switch"],summary';
const installations = new WeakMap();

/** Shared by the real router and the explicitly in-match dev harness. No settings/UI module dependency. */
export function applyPaperPresentation(settings, inMatch, options = {}) {
  const active = paperStyleActive(settings, inMatch);
  const sound = settings?.paperButtonSounds === true;
  const doc = options.doc ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return active;
  for (const link of doc.querySelectorAll?.('link[data-paper-style]') || []) link.media = active ? 'all' : 'not all';
  const root = doc.documentElement;
  if (root) {
    root.dataset.paperStyle = active ? 'on' : 'off';
    root.dataset.paperScope = inMatch ? 'inside' : 'outside';
    root.style.colorScheme = active ? 'light' : 'dark';
  }
  doc.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', active ? '#f8f2e7' : '#0c0f0e');
  doc.querySelector?.('meta[name="color-scheme"]')?.setAttribute('content', active ? 'light' : 'dark');
  const player = options.player ?? audio;
  player.setPaperUiEnabled?.(sound);
  installations.get(doc)?.setActive(active, sound);
  return active;
}

/** Kept separate from event handling so disabled ancestors and non-control form inputs stay silent. */
export function paperControl(target) {
  const node = target?.closest ? target : target?.parentElement;
  const control = node?.closest?.(CONTROL);
  if (!control || control.disabled || control.matches?.(':disabled') || control.getAttribute?.('aria-disabled') === 'true'
    || control.getAttribute?.('aria-busy') === 'true' || control.closest?.('[data-paper-feedback="off"]')) return null;
  return control;
}

/**
 * Installed once by main.js after installAudio(). Returns an idempotent cleanup for tests/hot reload.
 * Dependencies are optional so pointer/keyboard cancellation can be tested without a browser or audio hardware.
 * @param {{ doc?: any, win?: any, player?: any, clock?: ()=>number }} [options]
 */
export function installPaperFeedback(options = {}) {
  const win = options.win ?? (typeof window === 'undefined' ? null : window);
  const doc = options.doc ?? win?.document;
  if (!doc?.addEventListener) return () => {};
  if (installations.has(doc)) return installations.get(doc);
  const player = options.player ?? audio;
  const clock = options.clock ?? (() => win?.performance?.now?.() ?? Date.now());
  const defer = win?.queueMicrotask?.bind(win) ?? globalThis.queueMicrotask ?? (fn => Promise.resolve().then(fn));
  const timers = new Map();
  const listeners = [];
  let pressed = null;
  let hovered = null;
  let repeatTarget = null;
  let disposed = false;
  let motion = false;
  let sound = false;
  const listen = (host, type, fn, needsMotion = true) => {
    const gated = event => { if (motion || (!needsMotion && sound)) fn(event); };
    host?.addEventListener?.(type, gated, true);
    listeners.push([host, type, gated]);
  };
  const stopTimer = control => {
    const timer = timers.get(control);
    if (timer != null) clearTimeout(timer);
    timers.delete(control);
  };
  const mark = control => {
    control.setAttribute('data-paper-ui', '');
    // Full-card image hit areas must keep their image alignment; they still receive an ink/focus cue.
    if (control.classList.contains('doctor-card__portrait-button')) control.setAttribute('data-paper-motion', 'ink');
  };
  const clearPress = () => {
    if (!pressed) return;
    stopTimer(pressed.control);
    pressed.control.classList.remove('paper-pressed', 'paper-release');
    pressed = null;
  };
  const release = control => {
    if (!control) return;
    const delay = pressed?.control === control ? Math.max(0, 42 - (clock() - pressed.at)) : 0;
    if (pressed?.control === control) pressed = null;
    stopTimer(control);
    const finish = () => {
      timers.delete(control);
      control.classList.remove('paper-pressed');
      control.classList.add('paper-release');
      timers.set(control, setTimeout(() => { control.classList.remove('paper-release'); timers.delete(control); }, 240));
    };
    if (delay) timers.set(control, setTimeout(finish, delay));
    else finish();
  };
  const begin = (control, pointerId, key) => {
    clearPress(); stopTimer(control); mark(control);
    control.classList.remove('paper-release');
    control.classList.add('paper-pressed');
    pressed = { control, pointerId, key, at: clock() };
  };
  const reset = () => {
    clearPress();
    repeatTarget = null;
    hovered?.classList.remove('paper-hover'); hovered = null;
    for (const [control, timer] of timers) {
      clearTimeout(timer);
      control.classList.remove('paper-pressed', 'paper-release');
    }
    timers.clear();
  };

  listen(doc, 'pointerover', event => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const control = paperControl(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    hovered?.classList.remove('paper-hover'); hovered = control; mark(control);
    control.classList.add('paper-hover');
  });
  listen(doc, 'pointerout', event => {
    const control = paperControl(event.target);
    if (!control || control.contains(event.relatedTarget)) return;
    control.classList.remove('paper-hover');
    if (hovered === control) hovered = null;
    if (pressed?.control === control) clearPress();
  });
  listen(doc, 'pointerdown', event => {
    if (event.button != null && event.button !== 0) return;
    const control = paperControl(event.target);
    if (control) begin(control, event.pointerId, null);
  });
  listen(doc, 'pointerup', event => {
    if (pressed && pressed.pointerId === event.pointerId) {
      if (paperControl(event.target) === pressed.control) release(pressed.control);
      else clearPress();
    }
  });
  listen(doc, 'pointercancel', clearPress);
  listen(doc, 'focusin', event => { const control = paperControl(event.target); if (control) mark(control); });
  listen(doc, 'focusout', () => { repeatTarget = null; if (pressed?.key) clearPress(); }, false);
  listen(doc, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return;
    const control = paperControl(event.target);
    if (event.repeat) { repeatTarget = control; return; }
    repeatTarget = null;
    if (control && motion) begin(control, null, event.key);
  }, false);
  listen(doc, 'keyup', event => {
    repeatTarget = null;
    if (pressed?.key === event.key) release(pressed.control);
  }, false);
  listen(doc, 'click', event => {
    if (event.button != null && event.button !== 0) return;
    const control = paperControl(event.target);
    if (!control) return;
    if (event.detail === 0 && repeatTarget === control) return;
    if (motion) {
      mark(control);
      if (!timers.has(control)) release(control);
    }
    // Explicit click/tab/back/error handlers run first. AudioManager's action gate then suppresses this fallback.
    if (sound) defer(() => { if (sound && !disposed && !event.defaultPrevented) player.paperUi(); });
  }, false);
  listen(win, 'blur', reset, false);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); }, false);
  const dispose = () => {
    if (disposed) return;
    disposed = true; reset();
    for (const [host, type, fn] of listeners) host?.removeEventListener?.(type, fn, true);
    installations.delete(doc);
  };
  dispose.setActive = (showMotion, playSound) => {
    if ((motion && !showMotion) || (sound && !playSound)) repeatTarget = null;
    if (motion && !showMotion) {
      reset();
      for (const control of doc.querySelectorAll?.('[data-paper-ui]') || []) {
        control.classList.remove('paper-hover', 'paper-pressed', 'paper-release');
        control.removeAttribute('data-paper-ui');
        control.removeAttribute('data-paper-motion');
      }
    }
    motion = showMotion;
    sound = playSound;
  };
  installations.set(doc, dispose);
  return dispose;
}
