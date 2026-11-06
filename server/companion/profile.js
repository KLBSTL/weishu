import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { companionLibrary, actorSessionKey } from './library.js';
import { characterContext } from './materials.js';

export const companionDirectory = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet');
export function petProfile(petId = 'main', directory = companionDirectory()) {
  const library = companionLibrary(directory), data = library.snapshot();
  if (!data.bindings[petId] && !data.actors.some(a => a.id === petId)) return { petId, actorId: petId, card: null, revision: data.revision };
  const actor = library.actor(petId, data);
  return { petId, actorId: actor.id, card: library.card(petId, data), revision: data.revision,
    userPersona: data.userPersona, preset: data.preset, library, actor,
    state: data.states[actorSessionKey(actor)]?.value || {} };
}
export function profilePrompt(profile, question = '') {
  return characterContext(profile.card, question, { userName: profile.userPersona?.name, state: profile.state })
    + (profile.userPersona?.description ? '\n【玩家虚构身份，不是现实用户资料】' + profile.userPersona.description : '')
    + (profile.preset?.style ? '\n【表达风格】' + profile.preset.style : '');
}
export function hasLibrary(directory = companionDirectory()) { return existsSync(join(directory, 'companion-library.json')); }
