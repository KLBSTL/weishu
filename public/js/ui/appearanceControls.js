import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { data } from '../data.js';
import { assets, spineEntry } from '../assets.js';
import { readAppearance, setAppearance } from '../appearance.js';
import { ensurePixi } from '../render/app/pixi.js';
import { t } from '../../../shared/i18n.js';

function syncPreview(runtime, playback) {
  if (!runtime) return;
  const { app, node, entry, available } = runtime;
  const name = available.has(playback.clip) ? playback.clip : entry.anims?.idle || available.values().next().value;
  if (name && name !== runtime.clip && available.has(name)) {
    node.state.setAnimation(0, name, true);
    node.update(0);
    runtime.clip = name;
    const bounds = node.getLocalBounds();
    const scale = Math.min(280 / Math.max(1, bounds.width), 215 / Math.max(1, bounds.height));
    node.scale.set(scale); node.position.set(160 - (bounds.x + bounds.width / 2) * scale, 125 - (bounds.y + bounds.height / 2) * scale);
  }
  if (playback.animate && runtime.visible && !document.hidden) app.start();
  else { app.stop(); app.render(); }
}

export function SkinPreview({ entry, clip, animate }) {
  const host = useRef(null);
  const runtime = useRef(null);
  const playback = useRef({ clip, animate });
  playback.current = { clip, animate };
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!entry || !host.current) return undefined;
    let stopped = false, app = null, acquired = false, node = null;
    let observer = null;
    const onVisible = () => syncPreview(runtime.current, playback.current);
    setError(false);
    (async () => {
      const P = await ensurePixi();
      if (stopped) return;
      const skeleton = await assets.spine.acquire(entry); acquired = true;
      if (stopped) { assets.spine.release(entry); acquired = false; return; }
      app = new P.Application({ width: 320, height: 240, backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 1.5), autoDensity: true, autoStart: false, sharedTicker: false });
      app.ticker.maxFPS = 30;
      host.current.appendChild(app.view);
      node = new P.spine.Spine(skeleton); node.autoUpdate = false; app.stage.addChild(node);
      const available = new Set(skeleton.animations.map(action => action.name));
      runtime.current = { app, node, entry, available, clip: null, visible: true };
      app.ticker.add(delta => node.update(Math.min(delta / 60, .05)));
      document.addEventListener('visibilitychange', onVisible);
      if (typeof IntersectionObserver === 'function') {
        observer = new IntersectionObserver(entries => {
          if (stopped || !runtime.current) return;
          runtime.current.visible = entries.some(value => value.isIntersecting);
          onVisible();
        });
        observer.observe(host.current);
      }
      onVisible();
    })().catch(() => { if (!stopped) setError(true); });
    return () => {
      stopped = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      runtime.current = null;
      if (node) { app?.stage.removeChild(node); node.destroy({ children: true, texture: false, baseTexture: false }); }
      app?.destroy(true, { children: false, texture: false, baseTexture: false });
      if (acquired) { assets.spine.release(entry); acquired = false; }
    };
  }, [entry]);
  useEffect(() => { syncPreview(runtime.current, playback.current); }, [clip, animate]);
  return html`<div class="appearance-preview" ref=${host} data-testid="appearance-preview">${error ? html`<p role="status">${t('模型暂时无法显示，请重试或选择默认皮肤')}</p>` : null}<//>`;
}

export function AppearanceControls({ charId, manifest = null }) {
  const m = manifest || data.get('assets');
  const record = m?.chars?.[charId];
  const [prefs, setPrefs] = useState(() => readAppearance(charId));
  const [view, setView] = useState('front');
  const [clip, setClip] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setPrefs(readAppearance(charId)); setView('front'); setClip(''); }, [charId]);
  useEffect(() => { const update = () => setPrefs(readAppearance(charId)); globalThis.addEventListener?.('sp:appearance', update); return () => globalThis.removeEventListener?.('sp:appearance', update); }, [charId]);
  if (!record?.spine?.front) return null;
  const skins = record.skins || [];
  const selected = skins.find(skin => skin.skinId === prefs.skin);
  const selectedId = selected?.skinId || '';
  const base = selected ? selected.base : record.base;
  const entry = view === 'base' && base ? base : spineEntry(m, charId, { back: view === 'back', skin: selectedId });
  const actions = Object.keys(entry?.animations || {});
  // Building models often call their animated rest pose Relax; Default is just a zero-duration setup pose.
  const baseIdle = view === 'base' ? actions.find(name => /^(idle|relax)(?:_?loop)?$/i.test(name) && entry.animations[name] > 0) : null;
  const currentClip = actions.includes(clip) ? clip : baseIdle || entry?.anims?.idle || actions[0] || '';
  const change = patch => setPrefs(setAppearance(charId, patch));
  return html`<details class="appearance-controls" data-testid="appearance-controls" data-char=${charId} open=${expanded}
      onToggle=${event => setExpanded(event.currentTarget.open)}>
    <summary>${t('皮肤与动作')}</summary>
    ${expanded ? html`<div class="appearance-controls__body">
    <label>${t('选择皮肤')}<select aria-label=${t('选择皮肤')} value=${selectedId} onChange=${event => { change({ skin: event.target.value || null }); setClip(''); if (view === 'base') setView('front'); }}>
      <option value="">${t('默认皮肤')}</option>${skins.map(skin => html`<option key=${skin.skinId} value=${skin.skinId}>${skin.name}</option>`)}
    </select></label>
    <label class="appearance-toggle"><input type="checkbox" checked=${prefs.animate} onChange=${event => change({ animate: event.target.checked })} />${t('播放动作')}</label>
    <div class="appearance-selects"><label>${t('模型方向')}<select aria-label=${t('模型方向')} value=${view} onChange=${event => { setView(event.target.value); setClip(''); }}>
      <option value="front">${t('正面')}</option><option value="back">${t('背面')}</option>${base ? html`<option value="base">${t('基建动作')}</option>` : null}
    </select></label><label>${t('预览动作')}<select aria-label=${t('预览动作')} value=${currentClip} onChange=${event => setClip(event.target.value)}>
      ${actions.map(name => html`<option key=${name} value=${name}>${name}</option>`)}
    </select></label></div>
    <${SkinPreview} entry=${entry} clip=${currentClip} animate=${prefs.animate} />
    </div>` : null}
  </details>`;
}
