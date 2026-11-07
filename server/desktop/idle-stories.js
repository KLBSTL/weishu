import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s\d]/gu, '');
const common = new Set(['自己', '时候', '喜欢', '觉得', '不过', '后来', '其实', '今天', '现在', '我们', '你们', '这个', '那个', '可以', '一点', '一起', '每天', '还是', '慢慢', '那时', '总是', '就是', '常常', '这样', '那样', '如果', '可能', '因为', '所以', '一些', '一段', '当时', '有时', '记得']);
function grams(text) {
  const plain = normalize(text), result = new Set();
  for (let i = 0; i < plain.length - 1; i++) {
    const pair = plain.slice(i, i + 2); if (!common.has(pair)) result.add(pair);
  }
  return result;
}
function overlap(a, b) { let count = 0; for (const token of a) if (b.has(token)) count++; return count; }
export function storySimilarity(a, b) {
  if (normalize(a) === normalize(b)) return 1;
  const left = grams(a), right = grams(b);
  if (Math.min(left.size, right.size) < 5) return 0;
  const count = overlap(left, right);
  const meaningful = text => new Set((normalize(text).replace(/[我你他她它这那的地得是了在和与有把会就也都很最还想能让但而所以为时着个一]/gu, '').match(/\p{Script=Han}/gu) || []));
  const charsA = meaningful(a), charsB = meaningful(b);
  const reordered = Math.min(charsA.size, charsB.size) >= 6 ? 1.6 * overlap(charsA, charsB) / (charsA.size + charsB.size) : 0;
  return Math.max(2 * count / (left.size + right.size), .8 * count / Math.min(left.size, right.size), reordered);
}
export const repeatsStory = (text, recent) => recent.some(row => storySimilarity(text, typeof row === 'string' ? row : row.text) >= .52);

export function storyKey(card, seeds = [], personaKey = '') {
  if (typeof personaKey === 'string' && personaKey.startsWith('character:')) return personaKey;
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return (card ? 'card-' : 'default-') + digest(JSON.stringify(stable(card || { seeds, personaKey })));
}
const catalogCache = new Map();
export function storyCatalog(seeds) {
  const cacheKey = digest(JSON.stringify(seeds));
  if (catalogCache.has(cacheKey)) return catalogCache.get(cacheKey);
  const result = [];
  for (const text of seeds) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const id = digest(normalize(text));
    const trait = /^【性格\/习惯，不是过去事件；角度：([^】]+)】/u.exec(text);
    if (!result.some(row => row.id === id)) result.push({ id, text: text.trim(), topic: id,
      ...(trait && { angle: trait[1], baseKey: digest(normalize(text.slice(trait[0].length))) }) });
    if (result.length >= 2048) break;
  }
  // Adjacent facts that describe the same event must not become separate unused stories.
  const postings = new Map(), parents = new Map();
  const root = id => { let parent = id; while (parents.has(parent)) parent = parents.get(parent); return parent; };
  for (let i = 0; i < result.length; i++) {
    const tokens = grams(result[i].text), candidates = new Map();
    for (const token of tokens) for (const j of postings.get(token) || []) candidates.set(j, (candidates.get(j) || 0) + 1);
    for (const [j] of [...candidates].filter(([, hits]) => hits >= 2).sort((a, b) => b[1] - a[1]).slice(0, 24)) {
      if ((result[i].angle || result[j].angle) && result[i].angle !== result[j].angle) continue;
      if (storySimilarity(result[i].text, result[j].text) >= .43) {
        const from = root(result[i].id), to = root(result[j].id); if (from !== to) parents.set(from, to);
      }
    }
    for (const token of tokens) { const list = postings.get(token) || []; if (list.length < 96) list.push(i); postings.set(token, list); }
  }
  for (const row of result) row.topic = root(row.id);
  const frequency = new Map();
  for (const row of result) for (const token of grams(row.text)) frequency.set(token, (frequency.get(token) || 0) + 1);
  const catalog = result.map(row => ({ ...row, anchors: [...grams(row.text)].filter(token => (frequency.get(token) || 0) <= Math.max(1, result.length / 2)) }));
  if (catalogCache.size >= 8) catalogCache.delete(catalogCache.keys().next().value);
  catalogCache.set(cacheKey, catalog); return catalog;
}
function mentionedTopics(text, catalog) {
  const tokens = grams(text);
  return catalog.map(row => ({ topic: row.topic, hits: overlap(tokens, new Set(row.anchors)), total: row.anchors.length }))
    .filter(row => row.hits >= 2 && row.hits / Math.max(1, Math.min(tokens.size, row.total)) >= .18)
    .sort((a, b) => b.hits - a.hits).slice(0, 2).map(row => row.topic);
}

export const creativeAngles = [
  '此刻想试的一件小事', '一种声音带来的感觉', '一个想去的地方，只谈愿望', '对身边一件小物品的联想',
  '今天可以做的一项小计划', '对一种颜色的感受', '一件想学会的小技能', '想象中的小冒险，明确是假想',
  '想给玩家的一点小鼓励', '对不同天气的眼下感受', '整理东西时想留下什么', '想尝试的一种味道',
  '此刻想画下的一个画面', '一件觉得有趣的小问题', '如果能放一天假会做什么', '想分享的一种小发现',
  '对一个新习惯的想法', '希望下一次一起做的小事', '对一段安静时光的想象', '给未来自己留一句话',
];

/** One bounded local ledger; no embedding service or extra model indexing calls. */
export class StoryMemory {
  constructor(file = null) { this.file = file; this.data = null; this.path = null; }
  load() {
    const path = typeof this.file === 'function' ? this.file() : this.file;
    if (this.data && this.path === path) return this.data;
    this.path = path;
    let saved;
    try { if (path) saved = JSON.parse(readFileSync(path, 'utf8')); } catch { /* first use */ }
    this.data = saved?.version === 2 && saved.cards && typeof saved.cards === 'object'
      ? saved : { version: 2, activeKey: null, cards: {} };
    return this.data;
  }
  entry(key, catalog, legacy = []) {
    const data = this.load();
    if (!data.cards[key]) {
      const recent = legacy.filter(text => typeof text === 'string').slice(-48).map(text => ({ text, summary: text.slice(0, 80) }));
      data.cards[key] = { used: {}, attempted: {}, rejected: {}, recent, sequence: 0, touched: Date.now() };
      for (const row of recent) for (const topic of mentionedTopics(row.text, catalog)) data.cards[key].used[topic] = true;
    }
    const entry = data.cards[key];
    entry.touched = Date.now(); data.activeKey = key;
    return entry;
  }
  persist() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temp, JSON.stringify(this.data), { flag: 'wx' }); renameSync(temp, this.path); }
    finally { rmSync(temp, { force: true }); }
  }
  select(entry, catalog, grounded, excluded = new Set()) {
    const choices = grounded ? catalog : creativeAngles.map((text, index) => ({ id: 'creative-' + index, topic: 'creative-' + index, text }));
    const next = choices.filter(row => !entry.used[row.topic] && !excluded.has(row.topic) && (entry.rejected[row.topic] || 0) < 2)
      .sort((a, b) => (entry.attempted[a.topic] || 0) - (entry.attempted[b.topic] || 0))[0];
    if (!next && !grounded && choices.length) {
      // Rotate to a new cycle without erasing background coverage or repeating the last angle.
      const recentTopics = new Set(entry.recent.slice(-6).map(row => row.topic));
      const unused = choices.filter(row => !recentTopics.has(row.topic) && !excluded.has(row.topic)).sort((a, b) => (entry.attempted[a.topic] || 0) - (entry.attempted[b.topic] || 0))[0];
      if (unused) { delete entry.used[unused.topic]; delete entry.rejected[unused.topic]; return this.select(entry, [unused], false, new Set([...excluded, ...choices.filter(row => row !== unused).map(row => row.topic)])); }
    }
    if (!next) return null;
    entry.attempted[next.topic] = ++entry.sequence;
    try { this.persist(); } catch { /* keep in-memory progress even on a read-only profile */ }
    return next;
  }
  repeated(text, entry, catalog, selected) {
    if (repeatsStory(text, entry.recent)) return true;
    // Source coverage is authoritative. Weak lexical anchors are not proof that a new event repeats an old one.
    return !!entry.used[selected.topic] || catalog.some(row => entry.used[row.topic]
      && !(selected.baseKey && row.baseKey === selected.baseKey && row.angle !== selected.angle) && storySimilarity(text, row.text) >= .52);
  }
  reject(entry, selected) {
    entry.rejected[selected.topic] = (entry.rejected[selected.topic] || 0) + 1;
    try { this.persist(); } catch { /* not fatal */ }
  }
  record(entry, selected, text, _catalog) {
    entry.used[selected.topic] = true;
    entry.recent = [...entry.recent, { text, topic: selected.topic, summary: selected.text.slice(0, 100) }].slice(-48);
    try { this.persist(); } catch { /* a disk failure must not hide generated speech */ }
  }
  recordPart(entry, selected, text, { id, final }) {
    entry.progress ??= {};
    const progress = entry.progress[selected.topic] ||= { heard: [], ids: [], completed: false };
    if (progress.ids.includes(id)) return;
    progress.ids.push(id); progress.heard.push(text); progress.completed = final;
    if (final) entry.used[selected.topic] = true;
    entry.recent = [...entry.recent, { text, topic: selected.topic, summary: text.slice(0, 100), segmentId: id }].slice(-48);
    this.persist();
  }
  reconcile(entry, catalog, history = []) {
    const topics = new Set(catalog.map(row => row.topic)); let changed = false;
    for (const message of history) {
      const source = message.source;
      if (message.role !== 'assistant' || source?.kind !== 'idle' || !topics.has(source.topicId)) continue;
      entry.progress ??= {};
      const progress = entry.progress[source.topicId] ||= { heard: [], ids: [], completed: false };
      if (progress.ids.includes(source.id)) continue;
      progress.ids.push(source.id); progress.heard.push(message.content); progress.completed ||= !!source.topicFinal;
      if (source.topicFinal) entry.used[source.topicId] = true;
      entry.recent = [...entry.recent, { text: message.content, topic: source.topicId, segmentId: source.id, summary: message.content.slice(0, 100) }].slice(-48);
      changed = true;
    }
    if (changed) { try { this.persist(); } catch { /* The displayed timeline still recovers progress on the next run. */ } }
  }
}
