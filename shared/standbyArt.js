// Cosmetic identities only; these never enter the chess pool or battle loadouts.
import { N_ } from './i18n.js';

export const STANDBY_SCENES = Object.freeze([
  { id: 'none', name: N_('原界面') },
  { id: 'rhodesNight', name: N_('夜幕') },
  { id: 'rhodesFlower', name: N_('花圃') },
]);
export const STANDBY_PORTRAITS = Object.freeze([
  { id: 'char_102_texas', name: N_('德克萨斯'), kind: 'operator', frame: ['50% 12%', 1, '#534f43'] },
  { id: 'char_103_angel', name: N_('能天使'), kind: 'operator', frame: ['48% 10%', 1, '#664640'] },
  { id: 'char_1012_skadi2', name: N_('浊心斯卡蒂'), kind: 'operator', frame: ['50% 20%', 1.35, '#4c393e'] },
  { id: 'char_1035_wisdel', name: N_('维什戴尔'), kind: 'operator', frame: ['54% 30%', 1.4, '#51433f'] },
  { id: 'art_mahoro', name: N_('茉幌 · 红黑卡面'), kind: 'poster', frame: ['50% 50%', 1, '#17131d'] },
  { id: 'art_pastel', name: N_('粉彩 · 几何拼贴'), kind: 'poster', frame: ['50% 50%', 1, '#17272b'] },
  { id: 'art_vinyl', name: N_('银发 · 唱片拼贴'), kind: 'poster', frame: ['50% 50%', 1, '#321b2e'] },
  { id: 'art_academy', name: N_('绿发 · 学院卡面'), kind: 'poster', frame: ['50% 50%', 1, '#1b3554'] },
  { id: 'art_film', name: N_('长发 · 胶片圆舞'), kind: 'poster', frame: ['50% 50%', 1, '#2c1845'] },
  { id: 'art_mint', name: N_('粉发 · 薄荷卡面'), kind: 'poster', frame: ['50% 50%', 1, '#12332c'] },
  { id: 'art_mahoro_sky', name: N_('茉幌 · 云端碎片'), kind: 'poster', frame: ['50% 50%', 1, '#e1edf6'] },
]);
export const CUSTOM_ROOM_PORTRAITS = Object.freeze(STANDBY_PORTRAITS.filter(p => p.kind === 'poster'));
export const DEFAULT_STANDBY = Object.freeze({ scene: 'none', dim: .45, assistant: 'none', cards: 'operator' });
export const PORTRAIT_LIMITS = Object.freeze({ sourceBytes: 20 * 1024 * 1024, uploadBytes: 4 * 1024 * 1024, width: 768, height: 1152 });
export const isUploadedPortrait = id => typeof id === 'string' && /^upload_[a-f0-9]{48}$/.test(id);

export function sanitizeStandby(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    scene: STANDBY_SCENES.some(s => s.id === r.scene) ? r.scene : DEFAULT_STANDBY.scene,
    dim: Number.isFinite(r.dim) ? Math.max(.15, Math.min(.8, Math.round(r.dim * 100) / 100)) : DEFAULT_STANDBY.dim,
    assistant: STANDBY_PORTRAITS.some(p => p.id === r.assistant) ? r.assistant : 'none',
    cards: ['operator', 'classic'].includes(r.cards) ? r.cards : DEFAULT_STANDBY.cards,
  };
}

/** Built-in manifest URLs or strictly shaped server-issued image IDs; never arbitrary user URLs. */
export const standbyPortraitUrl = (manifest, id) => {
  if (isUploadedPortrait(id)) return `/portraits/${id}.png`;
  const url = manifest?.standbyArt?.portraits?.[id];
  return typeof url === 'string' && url.startsWith('/assets/standby/') ? url : null;
};
export function standbyScene(manifest, id) {
  const scene = manifest?.standbyArt?.scenes?.[id];
  return scene && [scene.left, scene.right].every(url => typeof url === 'string' && url.startsWith('/assets/standby/'))
    && Number.isFinite(scene.ratio) && scene.ratio > 0 ? scene : null;
}
