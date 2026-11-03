import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioManager } from '../../public/js/audio.js';
import { installPaperFeedback, paperControl, applyPaperPresentation, setPaperFeedbackActive } from '../../public/js/ui/paperFeedback.js';
import { sanitizeSettings, menuArtActive } from '../../public/js/ui/gameLogic/settings.js';

function host() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    count(type) { return listeners.get(type)?.size || 0; },
    fire(type, props = {}) { const event = { defaultPrevented: false, ...props }; for (const fn of listeners.get(type) || []) fn(event); return event; },
  };
}

function button(classes = []) {
  const attrs = new Map();
  const tokens = new Set(classes);
  const control = {
    disabled: false,
    classList: { contains: token => tokens.has(token), add: (...args) => args.forEach(x => tokens.add(x)), remove: (...args) => args.forEach(x => tokens.delete(x)) },
    setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key) ?? null,
    removeAttribute: key => attrs.delete(key),
    matches: () => control.disabled,
    closest: selector => selector.startsWith('[data-paper-feedback') ? null : control,
    contains: node => node === control || node?.parentElement === control,
  };
  return control;
}

function audioFixture(paper = true) {
  const made = { contexts: 0, sources: [], buffers: [] };
  class Node { connect(to) { this.to = to; } disconnect() {} }
  class Context {
    constructor() { made.contexts++; this.state = 'running'; this.currentTime = 0; this.sampleRate = 24000; }
    createBuffer(channels, frames, rate) {
      const pcm = new Float32Array(frames);
      const buffer = { duration: frames / rate, getChannelData: () => pcm };
      made.buffers.push(buffer); return buffer;
    }
    createBufferSource() { const source = new Node(); source.start = () => made.sources.push(source); return source; }
    createGain() { const gain = new Node(); gain.gain = { value: 1 }; return gain; }
  }
  const win = { document: { hidden: false }, AudioContext: Context };
  const manager = new AudioManager({ win, getManifest: () => ({ audio: { sfx: { ui: { click: '/old-click', buy: '/buy' } } } }) });
  if (paper) manager.setPaperUiEnabled(true);
  return { made, win, manager, unlock() { manager.ctx = new Context(); manager.sfxGain = new Node(); } };
}

describe('paper feedback input lifecycle', () => {
  test('installs only once; mouse press/release observes controls without consuming their event', async () => {
    const doc = host(), win = host(), calls = [];
    let now = 0;
    const dispose = installPaperFeedback({ doc, win, player: { paperUi: kind => calls.push(kind) }, clock: () => now, active: true });
    assert.equal(installPaperFeedback({ doc, win }), dispose);
    assert.equal(doc.count('pointerdown'), 1);
    const control = button(['btn--primary']);
    const down = doc.fire('pointerdown', { target: control, pointerId: 1, button: 0 });
    assert.ok(control.classList.contains('paper-pressed'));
    assert.equal(down.defaultPrevented, false);
    now = 100;
    doc.fire('pointerup', { target: control, pointerId: 1 });
    assert.ok(control.classList.contains('paper-release'));
    doc.fire('click', { target: control, button: 0 });
    await Promise.resolve();
    assert.deepEqual(calls, ['press', 'confirm']);
    dispose();
    assert.equal(doc.count('click'), 0);
    assert.equal(control.classList.contains('paper-release'), false);
  });

  test('cancel, pointer leaving and blur clear pressed state; text/range/disabled controls stay silent', () => {
    const doc = host(), win = host(), calls = [];
    const dispose = installPaperFeedback({ doc, win, player: { paperUi: kind => calls.push(kind) }, active: true });
    const control = button();
    for (const type of ['pointercancel', 'pointerout', 'blur']) {
      doc.fire('pointerdown', { target: control, pointerId: 1, button: 0 });
      (type === 'blur' ? win : doc).fire(type, { target: control, relatedTarget: null });
      assert.equal(control.classList.contains('paper-pressed'), false, type);
    }
    const count = calls.length;
    for (const disabled of [button(), button()]) {
      disabled.disabled = true;
      doc.fire('pointerdown', { target: disabled, button: 0 });
      doc.fire('click', { target: disabled });
      assert.equal(paperControl(disabled), null);
    }
    const ariaDisabled = button(); ariaDisabled.setAttribute('aria-disabled', 'true');
    doc.fire('pointerdown', { target: ariaDisabled, button: 0 });
    const textOrRange = { closest: () => null };
    doc.fire('keydown', { target: textOrRange, key: ' ' });
    doc.fire('pointerdown', { target: textOrRange, button: 0 });
    doc.fire('pointerdown', { target: control, button: 2 });
    assert.equal(calls.length, count);
    dispose();
  });

  test('touch has no hover sound; Enter/Space repeats do not retrigger pressure or activate feedback', async () => {
    const doc = host(), win = host(), calls = [];
    const dispose = installPaperFeedback({ doc, win, player: { paperUi: kind => calls.push(kind) }, active: true });
    const control = button();
    doc.fire('pointerover', { target: control, pointerType: 'touch' });
    doc.fire('keydown', { target: control, key: 'Enter' });
    doc.fire('keydown', { target: control, key: 'Enter', repeat: true });
    doc.fire('click', { target: control, detail: 0 });
    await Promise.resolve();
    assert.deepEqual(calls, ['press']);
    doc.fire('focusout', { target: control });
    assert.equal(control.classList.contains('paper-pressed'), false);
    doc.fire('keydown', { target: control, key: ' ' });
    doc.hidden = true; doc.fire('visibilitychange');
    assert.equal(control.classList.contains('paper-pressed'), false);
    dispose();
  });

  test('explicit handler sound runs before delegated fallback, which AudioManager deduplicates', async () => {
    const f = audioFixture(); f.unlock();
    const doc = host(), win = host(), control = button();
    const dispose = installPaperFeedback({ doc, win, player: f.manager, active: true });
    doc.fire('click', { target: control });
    f.manager.sfx('back'); // existing handler, after capture but before the microtask
    await Promise.resolve();
    assert.equal(f.made.sources.length, 1);
    assert.ok(f.manager.paperBuffers.has('back'));
    assert.equal(f.manager.paperBuffers.has('select'), false);
    f.made.sources.forEach(source => source.onended()); dispose();
  });
});

describe('paper scene opt-in', () => {
  test('real and mock boot HTML start dark with all paper styles inactive, before any JS or stored preferences load', () => {
    for (const file of ['index.html', 'dev/game-mock.html']) {
      const src = readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8');
      const links = [...src.matchAll(/<link\b[^>]*data-paper-style[^>]*>/g)].map(match => match[0]);
      assert.equal(links.length, 4, file);
      assert.ok(links.every(link => /media="not all"/.test(link)), file);
      assert.match(src, /<meta name="color-scheme" content="dark"/, file);
      assert.match(src, /<meta name="theme-color" content="#0c0f0e"/, file);
    }
  });
  test('pencil menu artwork falls back to real text while dark, without overwriting its remembered choice', () => {
    for (const paperOutside of [false, true]) for (const paperInside of [false, true]) {
      const s = sanitizeSettings({ artUiEnabled: true, artUiTheme: 'pencilPaper', paperOutside, paperInside });
      assert.equal(menuArtActive(s, false), paperOutside);
      assert.equal(menuArtActive(s, true), paperInside);
      assert.equal(s.artUiTheme, 'pencilPaper');
      assert.equal(s.artUiEnabled, true);
      for (const artUiTheme of ['inkSeal', 'animeSquad', 'paperGarden', 'paperGardenSeated']) {
        assert.equal(menuArtActive({ ...s, artUiTheme }, false), true);
        assert.equal(menuArtActive({ ...s, artUiTheme }, true), true);
      }
    }
    assert.equal(menuArtActive(sanitizeSettings({ artUiTheme: 'pencilPaper', paperOutside: true, artUiEnabled: false }), false), false);
  });
  test('all four preference combinations select only their own scene and do not follow illustrated-art selection', () => {
    const links = Array.from({ length: 4 }, () => ({ media: 'not all' }));
    const theme = button(), scheme = button();
    const doc = { documentElement: { dataset: {}, style: {} },
      querySelectorAll: selector => selector.startsWith('link') ? links : [],
      querySelector: selector => selector.includes('theme-color') ? theme : scheme };
    let enabled = null;
    const player = { setPaperUiEnabled(value) { enabled = value; } };
    for (const paperOutside of [false, true]) for (const paperInside of [false, true]) {
      const s = sanitizeSettings({ paperOutside, paperInside, artUiEnabled: true, artUiTheme: 'pencilPaper' });
      for (const inMatch of [false, true]) {
        const expected = inMatch ? paperInside : paperOutside;
        assert.equal(applyPaperPresentation(s, inMatch, { doc, player }), expected);
        assert.equal(enabled, expected);
        assert.ok(links.every(link => link.media === (expected ? 'all' : 'not all')));
        assert.equal(doc.documentElement.dataset.paperStyle, expected ? 'on' : 'off');
        assert.equal(doc.documentElement.style.colorScheme, expected ? 'light' : 'dark');
        assert.equal(theme.getAttribute('content'), expected ? '#f8f2e7' : '#0c0f0e');
        assert.equal(scheme.getAttribute('content'), expected ? 'light' : 'dark');
      }
    }
    assert.equal(applyPaperPresentation(sanitizeSettings({ artUiEnabled: true, artUiTheme: 'pencilPaper' }), false, { doc, player }), false);
  });

  test('default-off input is inert; disabling during a press clears feedback, timers and queued sound', async () => {
    const doc = host(), win = host(), calls = [], control = button();
    doc.querySelectorAll = () => [control];
    const player = { paperUi: kind => calls.push(kind), setPaperUiEnabled() {} };
    const dispose = installPaperFeedback({ doc, win, player });
    doc.fire('pointerover', { target: control, pointerType: 'mouse' });
    doc.fire('pointerdown', { target: control, button: 0, pointerId: 1 });
    doc.fire('click', { target: control });
    await Promise.resolve();
    assert.deepEqual(calls, []);
    assert.equal(control.getAttribute('data-paper-ui'), null);
    setPaperFeedbackActive(true, { doc, player });
    doc.fire('pointerdown', { target: control, button: 0, pointerId: 1 });
    assert.ok(control.classList.contains('paper-pressed'));
    doc.fire('click', { target: control });
    setPaperFeedbackActive(false, { doc, player });
    await new Promise(resolve => setTimeout(resolve, 65));
    assert.deepEqual(calls, ['press'], 'queued activation is dropped after the setting changes');
    assert.equal(control.classList.contains('paper-pressed'), false);
    assert.equal(control.classList.contains('paper-release'), false);
    assert.equal(control.getAttribute('data-paper-ui'), null);
    dispose();
  });

  test('audio defaults to legacy recorded clicks, switches only while active and stops paper voices on disable', () => {
    const f = audioFixture(false); f.unlock();
    const recorded = [];
    f.manager._play = url => recorded.push(url);
    assert.equal(f.manager.paperUiEnabled, false);
    f.manager.sfx('click');
    assert.deepEqual(recorded, ['/old-click']);
    assert.equal(f.manager.paperUi('press'), false);
    f.manager.setPaperUiEnabled(true);
    f.manager.sfx('click');
    assert.equal(f.made.sources.length, 1);
    assert.equal(f.manager.paperVoices, 1);
    f.manager.setPaperUiEnabled(false);
    assert.equal(f.manager.paperVoices, 0);
    assert.equal(f.manager.paperNodes.size, 0);
    f.manager.sfx('click'); f.manager.sfx('buy');
    assert.deepEqual(recorded, ['/old-click', '/old-click', '/buy']);
  });
});

describe('paper SFX audio bus', () => {
  test('hover before unlock is silent and does not create a context; mute/hidden/suspended/SFX zero are respected', () => {
    const f = audioFixture();
    assert.equal(f.manager.paperUi('hover'), false);
    assert.equal(f.made.contexts, 0);
    f.unlock();
    for (const mode of ['mute', 'zero', 'hidden', 'suspended']) {
      f.manager.volumes.muted = mode === 'mute';
      f.manager.volumes.sfx = mode === 'zero' ? 0 : 0.8;
      f.win.document.hidden = mode === 'hidden';
      f.manager.ctx.state = mode === 'suspended' ? 'suspended' : 'running';
      assert.equal(f.manager.paperUi('press'), false, mode);
    }
    assert.equal(f.made.sources.length, 0);
  });

  test('bounded short cues are distinct, cached, throttled and connected through the existing SFX gain', () => {
    const f = audioFixture(); f.unlock();
    for (const kind of ['hover', 'press', 'select', 'confirm', 'back', 'error']) {
      f.manager.ctx.currentTime += 0.2;
      assert.equal(f.manager.paperUi(kind), true, kind);
      const source = f.made.sources.at(-1);
      assert.equal(source.to.to, f.manager.sfxGain);
      assert.ok(source.buffer.duration <= 0.1051);
      assert.ok(source.buffer.getChannelData(0).every(x => Number.isFinite(x) && Math.abs(x) < 0.4));
      assert.equal(f.manager.paperUi(kind), false, `${kind} cooldown`);
      source.onended();
    }
    assert.equal(f.manager.paperVoices, 0);
    assert.equal(f.made.buffers.length, 6);
    assert.equal(new Set(f.made.buffers.map(buffer => Array.from(buffer.getChannelData(0).slice(0, 24)).join(','))).size, 6);
    f.manager.ctx.currentTime += 0.2; f.manager.paperUi('select');
    assert.equal(f.made.buffers.length, 6, 'no repeated sample allocation');
    f.made.sources.at(-1).onended();
  });

  test('generic click is replaced without loading its old sample; business sounds retain their path', () => {
    const f = audioFixture(); f.unlock();
    const recorded = [];
    f.manager._play = url => recorded.push(url);
    f.manager.sfx('click');
    assert.equal(f.made.sources.length, 1);
    assert.deepEqual(recorded, []);
    f.manager.sfx('buy');
    assert.deepEqual(recorded, ['/buy']);
    f.made.sources.at(-1).onended();
  });
});
