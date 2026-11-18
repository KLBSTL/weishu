import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { exportCardPng, pngCardMetadata, pngChunks } from '../server/companion/card-png.js';
import { parsePersona } from '../server/desktop/persona.js';
import { compileCard } from '../server/companion/materials.js';
import { evaluateLore } from '../server/companion/lore.js';
import { exportPromptPreset, importPromptPreset } from '../server/companion/prompts.js';

const folder = resolve(process.argv[2] || 'desktop-pet/cards/exusiai-lungmen-1.0.1');
const source = JSON.parse(await readFile(join(folder, '能天使.character.json'), 'utf8'));
const preset = importPromptPreset(JSON.parse(await readFile(join(folder, '能天使.prompt.json'), 'utf8')));
assert.equal(preset.settings.blocks.length, 4);
const document = structuredClone(source);
const extra = document.data.extensions.ark_companion;
extra.prompt_preset = exportPromptPreset(preset.settings, preset.name);
extra.package_readme = await readFile(join(folder, '使用与来源.md'), 'utf8');
const cover = await readFile(join(folder, 'cover.png'));
const png = exportCardPng(document, cover), parsed = parsePersona(png);
assert.deepEqual(parsed, parsePersona(Buffer.from(JSON.stringify(document))));
const metadata = pngCardMetadata(png);
for (const key of ['chara', 'ccv3']) {
  const data = JSON.parse(Buffer.from(metadata.get(key), 'base64')).data;
  const { prompt_preset, package_readme } = data.extensions.ark_companion;
  assert.deepEqual(importPromptPreset(prompt_preset), preset);
  assert.equal(package_readme, extra.package_readme);
  delete data.extensions.ark_companion.prompt_preset;
  delete data.extensions.ark_companion.package_readme;
  assert.deepEqual(data, source.data);
}
assert.equal(parsed.name, '能天使');
const pixels = bytes => Buffer.concat(pngChunks(bytes).filter(c => c.type === 'IDAT').map(c => c.data));
assert.deepEqual(pixels(png), pixels(cover), 'embedding metadata must preserve the supplied artwork');
const visualChunks = bytes => pngChunks(bytes).filter(c => !['tEXt', 'zTXt', 'iTXt'].includes(c.type)).map(c => c.raw);
assert.deepEqual(visualChunks(png), visualChunks(cover));
const compiled = compileCard(parsed);
assert.equal(compiled.sceneCard, false); assert.equal(compiled.speaker.name, '能天使');
const question = await evaluateLore(compiled, { question: '拜松和莫斯提马现在是什么情况？', preview: true });
const ordinary = await evaluateLore(compiled, { question: '今天想安静坐一会儿。', preview: true });
assert.ok(question.selected.some(b => b.text.includes('峯驰')));
assert.ok(question.selected.some(b => b.text.includes('莫斯提马')));
assert.ok(!ordinary.selected.some(b => b.text.includes('峯驰')));
const idle = await evaluateLore(compiled, { kind: 'automatic', focus: '拜松 莫斯提马', preview: true });
assert.equal(idle.blocks.length, 0, 'reference book must not become an unrequested idle story');
await writeFile(join(folder, '能天使-下班后的龙门.png'), png);
await writeFile(join(folder, '龙门日常.worldbook.json'), JSON.stringify(document.data.character_book, null, 2) + '\n');
const files = ['能天使-下班后的龙门.png', '能天使.character.json', '龙门日常.worldbook.json', '能天使.prompt.json', 'cover.png', '使用与来源.md'];
const manifest = { version: source.data.character_version, character: parsed.name, checkedAt: new Date().toISOString().slice(0, 10), formats: ['PNG chara v2 + ccv3', 'character JSON v2', 'character-book entries JSON', 'ark-companion-prompt v1'],
  validation: { pngRoundtrip: true, artworkPreserved: true, singleSpeaker: true, loreEntries: parsed.character_book.entries.length, keywordIsolation: true, idleBookExcluded: true, promptBlocks: preset.settings.blocks.length, embeddedPreset: true, embeddedReadme: true }, files: [] };
for (const file of files) { const bytes = await readFile(join(folder, file)); manifest.files.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ folder, pngBytes: png.length, ...manifest.validation }));
