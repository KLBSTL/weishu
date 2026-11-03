import { useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { Img } from './gameComponents.js';
import { data, useData } from '../data.js';
import { useStandby } from './standbyState.js';
import { STANDBY_PORTRAITS, standbyScene, standbyPortraitUrl } from '../../../shared/standbyArt.js';
import { t } from '../../../shared/i18n.js';

export function StandbyArt() {
  useData('assets');
  const s = useStandby();
  const [failed, setFailed] = useState(null);
  const scene = standbyScene(data.get('assets'), s.scene);
  if (!scene || failed === s.scene) return null;
  return html`<div class="standby-art" aria-hidden="true" style=${`--standby-dim:${s.dim};--scene-ratio:${scene.ratio}`}>
    <div class="standby-art__panorama">${[scene.left, scene.right].map(url => html`<img key=${url} src=${url} alt="" draggable=${false} onError=${() => setFailed(s.scene)} />`)}</div>
    <div class="standby-art__shade"></div>
  </div>`;
}

export function StandbyAssistant() {
  useData('assets');
  const s = useStandby();
  const entry = STANDBY_PORTRAITS.find(p => p.id === s.assistant);
  const src = standbyPortraitUrl(data.get('assets'), s.assistant);
  if (!entry || !src) return null;
  return html`<aside class=${`standby-assistant is-${entry.kind}`} aria-label=${t('大厅展示图')}>
    <span class="standby-assistant__index" aria-hidden="true">PERSONNEL / 01</span>
    <${Img} src=${src} alt=${t(entry.name)} fallback=${html`<span>${t('图片暂不可用')}</span>`} />
    <div class="standby-assistant__caption"><small>STANDBY DISPLAY</small><strong>${t(entry.name)}</strong></div>
  </aside>`;
}
