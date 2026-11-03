import { createStore, loadPref, savePref, useStore, store } from '../store.js';
import { sanitizeStandby, isUploadedPortrait } from '../../../shared/standbyArt.js';

const saved = loadPref('standby', null);
// One-time return to the original background; subsequent explicit scene choices remain selectable.
const initial = sanitizeStandby(saved?.sceneRevision === 1 ? saved : { ...saved, scene: 'none' });
savePref('standby', { ...initial, sceneRevision: 1 });
const savedUploads = loadPref('roomUploads', []);
export const standbyStore = createStore({ ...initial, portrait: loadPref('roomAvatar', null),
  uploads: Array.isArray(savedUploads) ? [...new Set(savedUploads.filter(isUploadedPortrait))].slice(0, 8) : [] });
standbyStore.subscribe((s, prev) => {
  savePref('standby', { ...sanitizeStandby(s), sceneRevision: 1 });
  if (s.portrait !== prev.portrait) savePref('roomAvatar', s.portrait);
  if (s.uploads !== prev.uploads) savePref('roomUploads', s.uploads);
});
export const rememberUpload = id => {
  if (isUploadedPortrait(id)) standbyStore.set({ uploads: [id, ...standbyStore.get().uploads.filter(p => p !== id)].slice(0, 8) });
};
export const useStandby = () => useStore(s => s, Object.is, standbyStore);
export const updateStandby = patch => standbyStore.set(sanitizeStandby({ ...standbyStore.get(), ...patch }));
export const readRoomPortrait = playerId => loadPref(`roomAvatar:${playerId}`, loadPref('roomAvatar', null));
export const rememberRoomPortrait = id => {
  const playerId = store.get().me?.playerId;
  if (playerId != null) savePref(`roomAvatar:${playerId}`, id);
  standbyStore.set({ portrait: id });
};
export const appearanceDialog = createStore({ open: false });
export const openAppearance = () => appearanceDialog.set({ open: true });
