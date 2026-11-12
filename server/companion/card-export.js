import { pngCardMetadata, exportCardPng, defaultCover } from './card-png.js';
import { compileCard } from './materials.js';

function originalDocument(asset) {
  if (!asset.originalBytes) return { spec: 'chara_card_v3', spec_version: '3.0', data: structuredClone(asset.card.data || asset.card) };
  const bytes = Buffer.from(asset.originalBytes, 'base64');
  if (asset.sourceFormat !== 'png') return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const metadata = pngCardMetadata(bytes);
  return JSON.parse(Buffer.from(metadata.get('ccv3') || metadata.get('chara') || '', 'base64').toString());
}
export function currentDocument(library, actorId, { singleActor = false } = {}) {
  const data = library.snapshot(), actor = library.actor(actorId, data, true), asset = data.assets.find(a => a.id === actor.assetId);
  if (!asset) throw new Error('请先选择角色卡');
  const base = originalDocument(asset), raw = structuredClone(base.data || base), scene = compileCard(asset.card).sceneCard, overrides = actor.overrides || {};
  if (scene && actor.speaker?.name) {
    raw.extensions = { ...raw.extensions, ark_companion: { ...raw.extensions?.ark_companion, speaker: { ...actor.speaker,
      ...Object.fromEntries(Object.entries(overrides).filter(([k]) => ['description', 'personality', 'background', 'mes_example'].includes(k))) }, ruleProfile: actor.ruleProfile || 'legacy' } };
    if (singleActor) Object.assign(raw, { name: actor.speaker.name, description: overrides.description || actor.speaker.description || raw.description, personality: overrides.personality || actor.speaker.personality || raw.personality });
  } else for (const key of ['name', 'description', 'personality', 'scenario', 'mes_example', 'background']) if (typeof overrides[key] === 'string') raw[key] = overrides[key];
  if (actor.embeddedBook) raw.character_book = structuredClone(actor.embeddedBook);
  if (raw.character_book && actor.bookProactive?.embedded !== undefined) raw.character_book.extensions = { ...raw.character_book.extensions,
    ark_companion: { ...raw.character_book.extensions?.ark_companion, proactive: actor.bookProactive.embedded } };
  raw.extensions = { ...raw.extensions, ark_companion: { ...raw.extensions?.ark_companion, ruleProfile: actor.ruleProfile || 'legacy' } };
  raw.extensions.ark_companion.boundBooks = (actor.bookIds || []).map(id => { const book = data.assets.find(a => a.kind === 'lorebook' && a.id === id);
    return { id, name: book?.name || '', proactive: actor.bookProactive?.[id] !== false }; });
  return { document: { ...(base.data ? base : {}), spec: 'chara_card_v3', spec_version: '3.0', data: raw }, asset, actor };
}
export function currentPng(library, actorId, { cover, singleActor } = {}) {
  const { document, asset } = currentDocument(library, actorId, { singleActor });
  const image = cover ? Buffer.from(cover, 'base64') : asset.sourceFormat === 'png' && asset.originalBytes ? Buffer.from(asset.originalBytes, 'base64') : defaultCover();
  return { name: document.data.name, file: exportCardPng(document, image).toString('base64'), original: true, extension: 'png' };
}
