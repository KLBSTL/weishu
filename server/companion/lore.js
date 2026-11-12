import { Worker } from 'node:worker_threads';
import { planDraw, createPlan } from './plan.js';

const bounded = (value, fallback, max = 1000) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : fallback;
const settings = row => ({ ...row.rule, ...row.rule?.extensions });
const inclusionGroups = row => String(settings(row).group || '').split(',').map(s => s.trim()).filter(Boolean);
export const loreDepth = compiled => Math.min(1000, Math.max(4, ...compiled.lore.map(row => bounded(settings(row).scan_depth ?? settings(row).scanDepth ?? row.scanDepth, 4))));
async function matchRegex(rules, text) {
  if (!rules.length) return new Map();
  if (rules.length > 128 || text.length > 100000) return new Map(rules.map(r => [r.key, { error: 'regex-limit' }]));
  return new Promise(resolve => {
    const worker = new Worker(new URL('./lore-regex-worker.js', import.meta.url), { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 32 } });
    let done = false;
    const finish = rows => { if (done) return; done = true; clearTimeout(timer); void worker.terminate(); resolve(new Map(rows.map(r => [r.key, r]))); };
    const timer = setTimeout(() => finish(rules.map(r => ({ key: r.key, error: 'regex-timeout' }))), 200);
    worker.once('error', () => finish(rules.map(r => ({ key: r.key, error: 'regex-error' }))));
    worker.once('message', finish); worker.postMessage({ rules, text });
  });
}
function position(row) {
  const r = settings(row), value = r.position;
  return ({ 0: 'before', 1: 'after', 2: 'note-before', 3: 'note-after', 4: 'depth', 5: 'example-before', 6: 'example-after', 7: 'outlet', before_char: 'before', after_char: 'after' })[value] || 'after';
}
/** Read-only evaluation. Commit effects only with the assistant's display receipt. */
export async function evaluateLore(compiled, { question = '', history = [], plan = createPlan(), state = {}, messageCount = history.length,
  maxChars = 5000, kind = 'chat', focus = '', sourceIds = [], preview = false } = {}) {
  const selected = [], diagnostics = [], active = new Set(), decisions = plan.decisions, proposed = {};
  if (Number.isFinite(Number(compiled.tokenBudget)) && Number(compiled.tokenBudget) > 0) maxChars = Math.min(maxChars, Math.floor(Number(compiled.tokenBudget) / 2));
  const messages = [...history.filter(m => m.type === 'user' || m.type === 'assistant' && m.deliveryState === 'displayed' || m.role && !m.deliveryState)
    .map(m => ({ ...m, content: String(m.text ?? m.content ?? '') }))];
  if (question && messages.at(-1)?.content !== question) messages.push({ role: 'user', content: question });
  const byId = new Map(compiled.lore.map(row => [row.id, row]));
  let frontier = '', used = 0; const regexDeadline = Date.now() + 300, groupsUsed = new Set();
  const layers = bounded(compiled.recursionSteps, 4, 8) || 8;
  for (let layer = 0; layer < layers; layer++) {
    const candidates = [], pending = [];
    for (const row of compiled.lore) {
      if (active.has(row.id)) continue;
      const r = settings(row), timed = state[row.id]?.revision === (row.sourceRevision || compiled.revision) ? state[row.id] : undefined,
        depth = bounded(r.scan_depth ?? r.scanDepth ?? row.scanDepth, 4);
      const text = messages.slice(-depth || messages.length).map(m => (r.includeNames === false ? '' : (m.speakerName || m.role || m.type || '') + ': ') + m.content).join('\n');
      const buffer = [depth ? text : '', kind === 'automatic' || kind === 'manual' ? focus : '', layer ? frontier : ''].filter(Boolean).join('\n');
      const reason = (layer && (r.excludeRecursion || r.bookRecursive === false || compiled.recursive === false)) ? 'recursion-disabled'
        : ['manual', 'automatic'].includes(kind) && row.proactive === false ? 'proactive-disabled'
        : row.ownership === 'other' || compiled.sceneCard && !['self', 'world'].includes(row.ownership) ? 'private-or-unknown'
        : !layer && r.delayUntilRecursion ? 'recursion-only'
          : bounded(r.delay, 0) > messageCount ? 'delay'
            : timed?.cooldownUntil > messageCount && !(timed.stickyUntil > messageCount) ? 'cooldown'
              : ['note-before', 'note-after', 'outlet'].includes(position(row)) ? 'unsupported-position' : null;
      if (reason) { if (!layer) diagnostics.push({ id: row.id, path: row.path, reason }); continue; }
      const keys = [...row.keys, ...row.secondary];
      const regexes = keys.flatMap((key, index) => {
        const match = /^\/(.*)\/([a-z]*)$/u.exec(key);
        return match || r.use_regex ? [{ key: row.id + ':' + index, pattern: match?.[1] ?? key, flags: match?.[2] ?? (r.case_sensitive ? '' : 'i') }] : [];
      });
      pending.push({ row, r, buffer, regexes, timed });
    }
    // Each match operation has a bounded worker; identical buffers are evaluated together.
    const groups = new Map();
    for (const item of pending) if (item.regexes.length) { const rows = groups.get(item.buffer) || []; rows.push(...item.regexes); groups.set(item.buffer, rows); }
    const regexResults = new Map(); let regexGroups = 0;
    for (const [buffer, rules] of groups) {
      const results = ++regexGroups <= 8 && Date.now() < regexDeadline ? await matchRegex(rules, buffer) : new Map(rules.map(r => [r.key, { error: 'regex-limit' }]));
      for (const [key, value] of results) regexResults.set(key, value);
    }
    for (const { row, r, buffer, timed, regexes } of pending) {
      const flags = [...row.keys, ...row.secondary].map((key, i) => {
        const regex = regexResults.get(row.id + ':' + i); if (regex) return regex.matched === true;
        const value = r.case_sensitive ?? r.caseSensitive ? buffer : buffer.toLocaleLowerCase(), needle = r.case_sensitive ?? r.caseSensitive ? key : key.toLocaleLowerCase();
        if (!needle) return false;
        if ((r.matchWholeWords || r.match_whole_words) && /^[a-z0-9_]+$/iu.test(needle)) return new RegExp('(?:^|[^a-z0-9_])' + needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + '(?:$|[^a-z0-9_])', 'iu').test(value);
        return value.includes(needle);
      });
      const primary = flags.slice(0, row.keys.length).some(Boolean), secondary = flags.slice(row.keys.length), logic = r.selectiveLogic ?? r.selective_logic ?? 0;
      const filter = !row.selective || !secondary.length || ({ 0: secondary.some(Boolean), 1: !secondary.every(Boolean), 2: !secondary.some(Boolean), 3: secondary.every(Boolean),
        AND_ANY: secondary.some(Boolean), AND_ALL: secondary.every(Boolean), NOT_ANY: !secondary.some(Boolean), NOT_ALL: !secondary.every(Boolean) })[logic];
      const regexError = regexes.map(key => regexResults.get(key.key)?.error).find(Boolean);
      const forced = ['automatic', 'manual'].includes(kind) && [row.id, ...(row.unitIds || [])].some(id => sourceIds.includes(id)) && row.proactive !== false && ['self', 'world'].includes(row.ownership);
      const matched = timed?.stickyUntil > messageCount || row.constant || primary && filter || forced;
      const probability = r.useProbability === false ? 100 : Math.max(0, Math.min(100, Number(r.probability ?? 100)));
      const drawKey = 'lore:' + row.id, pass = timed?.stickyUntil > messageCount || probability === 100 || probability > 0 && planDraw(plan, drawKey) * 100 < probability;
      const reason = regexError || (!matched ? 'keyword' : !pass ? 'probability' : 'candidate');
      if (reason === 'candidate') candidates.push({ row, r, direct: layer === 0, timed, score: flags.filter(Boolean).length });
      else if (!layer) diagnostics.push({ id: row.id, path: row.path, reason, probability });
    }
    candidates.sort((a, b) => Number(b.row.constant) - Number(a.row.constant) || Number(b.direct) - Number(a.direct) || b.row.order - a.row.order || a.row.id.localeCompare(b.row.id));
    const winners = new Map(), newly = [];
    for (const item of candidates) {
      for (const group of inclusionGroups(item.row)) {
        if (winners.has(group)) continue;
        let peers = candidates.filter(c => inclusionGroups(c.row).includes(group));
        if (peers.some(p => p.r.useGroupScoring === true)) { const score = Math.max(...peers.map(p => p.score)); peers = peers.filter(p => p.score === score); }
        const prioritized = peers.filter(p => p.r.groupOverride), choices = prioritized.length ? prioritized : peers;
        const weight = peer => Math.max(0, Number.isFinite(Number(peer.r.groupWeight)) ? Number(peer.r.groupWeight) : 100);
        const total = choices.reduce((n, p) => n + weight(p), 0);
        let roll = planDraw(plan, 'group:' + group) * total, winner = choices[0];
        if (!prioritized.length && total > 0) for (const peer of choices) { roll -= weight(peer); if (roll < 0) { winner = peer; break; } }
        winners.set(group, winner.row.id);
      }
    }
    for (const { row, r, direct, timed } of candidates) {
      const groupsList = inclusionGroups(row);
      const reason = groupsList.some(g => winners.get(g) !== row.id || groupsUsed.has(g)) ? 'group'
        : used + row.text.length > maxChars ? 'budget' : 'active';
      diagnostics.push({ id: row.id, path: row.path, reason, position: position(row), direct, layer });
      if (reason !== 'active') continue;
      active.add(row.id); selected.push(row); used += row.text.length; for (const g of groupsList) groupsUsed.add(g);
      if (!r.preventRecursion && r.bookRecursive !== false) newly.push(row.text);
      const sticky = bounded(r.sticky, 0), cooldown = bounded(r.cooldown, 0);
      proposed[row.id] = timed?.stickyUntil > messageCount ? { ...timed, continuing: true }
        : { stickyUntil: messageCount + 1 + sticky, cooldownUntil: messageCount + 1 + sticky + cooldown, sticky, cooldown, revision: row.sourceRevision || compiled.revision };
    }
    if (!newly.length || compiled.recursive === false) break;
    frontier += '\n' + newly.join('\n');
  }
  selected.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const blocks = selected.map(row => ({ id: row.id, text: row.text, position: position(row), depth: bounded(settings(row).depth, 4, 100), role: ['system', 'user', 'assistant'][Number(settings(row).role)] || 'system' }));
  return { selected, diagnostics, blocks, usedChars: used, budgetMode: 'estimated-characters', maxChars, decisions, proposed: preview ? {} : proposed, messageCount, entryIds: [...byId.keys()] };
}

export function assembleLore(messages, blocks, charText = '', examples = '') {
  const output = messages.map(m => ({ ...m })), before = blocks.filter(b => b.position === 'before').map(b => b.text).join('\n'), after = blocks.filter(b => b.position === 'after').map(b => b.text).join('\n');
  const systemIndex = output.findIndex(m => m.role === 'system');
  if (systemIndex >= 0) output[systemIndex].content = [before, charText || output[systemIndex].content, after].filter(Boolean).join('\n');
  else output.unshift({ role: 'system', content: [before, charText, after].filter(Boolean).join('\n') });
  const exampleBlocks = [...blocks.filter(b => b.position === 'example-before').map(b => b.text), ...(examples ? [examples] : []), ...blocks.filter(b => b.position === 'example-after').map(b => b.text)];
  if (exampleBlocks.length) output.splice(1, 0, ...exampleBlocks.map(text => ({ role: 'system', content: '【说话示例资料，不是真实对话】\n' + text })));
  for (const block of blocks.filter(b => b.position === 'depth')) output.splice(Math.max(1, output.length - block.depth), 0, { role: block.role, content: '【世界书资料，不是真实玩家发言】\n' + block.text });
  return output;
}
