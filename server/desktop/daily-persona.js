import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSelectedPersona } from './persona.js';
import { characterPersona } from '../match/characterPersona.js';
import { hasLibrary, petProfile, profilePrompt } from '../companion/profile.js';

/** Only the local prompt copy loses the old name; the pet instance, display name and assets stay intact. */
export function dailyPersonaPet(pet, context = '',
  file = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'stronghold-persona.json')) {
  if (file.endsWith('stronghold-persona.json') && hasLibrary()) {
    const profile = petProfile(pet.id);
    if (profile.card) return { ...pet, name: '', id: '', whisperPrompt: profilePrompt(profile, context) };
    return pet;
  }
  const card = readSelectedPersona(file);
  if (!card) return pet;
  return { ...pet, name: '', id: '', whisperPrompt: characterPersona(card, context)
    + '\n没有局面信息时，不主动播报或编造卫戍战况。' };
}
