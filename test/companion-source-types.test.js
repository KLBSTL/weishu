import assert from 'node:assert/strict';
import { test } from 'node:test';
import { materialSections, compileCard } from '../server/companion/materials.js';
import { compileKnowledge, materialType } from '../server/companion/knowledge.js';
import { extractStorySeeds } from '../server/desktop/idle-chat.js';

test('multiline bold/bracket profile blocks remain identity facts and cannot become stories', () => {
  const description = '**衣着**：\n白色衬衫。\n蓝色长裙。\n**爱好**：我喜欢在安静的时候画海边的风景。\n\n有一次我在海边捡到了小贝壳，后来放在书桌上。';
  const card = { name: '小雨', description }, before = JSON.stringify(card);
  const units = materialSections(description, '/description');
  assert.equal(units[0].title, '衣着'); assert.ok(units[0].text.includes('蓝色长裙'));
  assert.equal(materialType(units[0].text, units[0].title), 'attribute');
  assert.ok(compileKnowledge(card).facts.some(f => f.text.includes('白色衬衫')));
  const seeds = extractStorySeeds(card);
  assert.ok(seeds.some(s => /画海边|小贝壳/u.test(s))); assert.ok(!seeds.some(s => /衬衫|长裙/u.test(s)));
  for (const unit of units) assert.equal(unit.evidence.sourceHash.length, 64);
  assert.equal(JSON.stringify(card), before);
});
test('clothing label variants are bounded; past events and normal interests remain narratable', () => {
  for (const label of ['【衣着】','服装风格','外貌描述','- **着装**：']) assert.equal(materialType('蓝色长裙。', label), 'attribute');
  for (const text of ['我曾经在海边捡到贝壳。','我喜欢在周末读书。']) assert.notEqual(materialType(text, 'description'), 'attribute');
});

test('plain voice headings retain examples while author sections never become facts or story seeds', () => {
  const description = '声部一·社会\n"我曾经在这里等过人。"\n\n声部四·作者\n这个习惯到底要不要留，我想了很久。\n\n# 经历\n我曾经修好过邻居的收音机，终于听到了远方的广播。';
  const card = { name: '小林', description };
  const units = materialSections(description, '/description');
  assert.equal(materialType(units[0].text, units[0].title), 'voice');
  const facts = compileKnowledge(card).facts;
  assert(compileCard(card).units.some(u => u.title === '声部一·社会' && u.text.includes('等过人')));
  assert(!facts.some(f => f.text.includes('等过人')), 'example dialogue remains available as style, not a factual memory');
  assert(!facts.some(f => f.text.includes('到底要不要留')));
  const seeds = extractStorySeeds(card);
  assert(seeds.some(s => s.includes('收音机'))); assert(!seeds.some(s => /等过人|到底要不要留/u.test(s)));
  assert.equal(materialType('- 外在：穿着制服，喜欢把袖子挽起来。'), 'attribute');
  for (const unit of units) assert.equal(unit.evidence.sourceHash.length, 64);
});
