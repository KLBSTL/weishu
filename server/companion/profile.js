import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { companionLibrary, actorSessionKey } from './library.js';
import { buildPrompt, resolvePromptSettings } from './prompts.js';

export const companionDirectory = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet');
export function petProfile(petId = 'main', directory = companionDirectory()) {
  const library = companionLibrary(directory), data = library.snapshot();
  if (!data.bindings[petId] && !data.actors.some(a => a.id === petId)) return { petId, actorId: petId, card: null, revision: data.revision };
  const actor = library.actor(petId, data);
  return { petId, actorId: actor.id, card: library.card(petId, data), revision: data.revision,
    characterId: actor.characterId, memoryRevision: data.memoryRevision || 0,
    userPersona: data.userPersona, preset: data.preset, library, actor,
    promptSettings: resolvePromptSettings(data, actor),
    state: data.states[actorSessionKey(actor)]?.value || {} };
}
export function profilePrompt(profile, question = '') {
  return buildPrompt(profile, { question }).system;
}
export function hasLibrary(directory = companionDirectory()) { return existsSync(join(directory, 'companion.sqlite')) || existsSync(join(directory, 'companion-library.json')); }
