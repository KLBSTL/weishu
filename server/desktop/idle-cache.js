import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compileCard, fingerprint, hasInventedUserHistory } from '../companion/materials.js';
import { spokenExamples, speechProblem } from '../companion/speech.js';

const present = [
  '这会儿正好能歇一歇，我想陪你聊点轻松的事。',
  '我还挺喜欢这样不赶时间地聊几句，想到什么就说什么。',
  '有些话不用急着一次说完，我想慢慢讲给你听。',
];
const plain = text => String(text || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
export function localOpeningLines(card) {
  const c = compileCard(card), name = c.speaker?.name, rows = [];
  const data = card?.data || card || {};
  rows.push(...spokenExamples(data.mes_example || '', name).split('\n'));
  for (const unit of c.units) {
    if (unit.kind !== 'background' || unit.ownership !== 'self' || unit.facet === 'appearance'
      || ['first_mes', 'mes_example'].includes(unit.title)) continue;
    for (let line of unit.text.split('\n')) {
      line = line.trim().replace(/^[-*]\s*/u, '').replace(/^(?:习惯|爱好|口头禅|性格)\s*[:：]\s*/u, '');
      if (name && name !== '我' && line.startsWith(name)) line = '我' + line.slice(name.length);
      if (!/^我/u.test(line) || /[{}<>]|(?:姓名|年龄|身份|职业)\s*[:：]/u.test(line)
        || c.candidates?.some(other => other.name !== name && line.includes(other.name))) continue;
      rows.push(...(line.match(/[^。！？]+[。！？]/gu) || []));
    }
  }
  const seen = new Set();
  return [...rows, ...present].filter(text => {
    const length = [...text].length, key = plain(text);
    if (length < 12 || length > 100 || speechProblem(text, name) || hasInventedUserHistory(text, [])
      || /(?:这|本|上)轮|这局|这把|漏怪|击杀\s*\d|LP\s*\d/iu.test(text) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 8);
}

/** Small, private on-disk outbox. Nothing here is heard until the display receipt. */
export class IdleCache {
  constructor(file, now = Date.now) { this.path = file; this.now = now; }
  get file() { return typeof this.path === 'function' ? this.path() : this.path; }
  read() {
    try { const data = JSON.parse(readFileSync(this.file, 'utf8')); if (data.version === 1 && data.entries) return data; } catch { /* first launch */ }
    return { version: 1, entries: {} };
  }
  save(data) {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(temporary, JSON.stringify(data)); renameSync(temporary, this.file);
    } catch { /* The in-memory generation path remains available if a profile is read-only. */ }
    finally { try { rmSync(temporary, { force: true }); } catch { /* optional cache */ } }
  }
  key(input) { return fingerprint([input.companionPetId, input.cacheActor, input.storyCard, input.cacheStyle ?? input.speakerStyle, input.cacheRevision, input.cacheEpoch || 'start']); }
  warm(input) {
    const data = this.read(), key = this.key(input), heard = new Set((input.history || []).filter(m => m.role === 'assistant').map(m => plain(m.content)));
    const entry = data.entries[key] ||= { rows: [], used: [], at: this.now() };
    entry.rows = entry.rows.filter(row => row.expires > this.now() && !heard.has(plain(row.text)));
    for (const text of localOpeningLines(input.storyCard)) {
      if (entry.rows.filter(row => row.origin === 'local').length >= 3) break;
      if (heard.has(plain(text)) || entry.used.includes(plain(text)) || entry.rows.some(row => plain(row.text) === plain(text))) continue;
      entry.rows.push({ id: randomUUID(), text, origin: 'local', expires: this.now() + 21600000 });
    }
    entry.at = this.now();
    for (const [old] of Object.entries(data.entries).sort((a, b) => b[1].at - a[1].at).slice(16)) delete data.entries[old];
    this.save(data); return entry.rows.sort((a, b) => Number(b.origin === 'model-cache') - Number(a.origin === 'model-cache'));
  }
  remember(input, batch, selected) {
    if (!batch.grounded) return;
    const data = this.read(), key = this.key(input), entry = data.entries[key] ||= { rows: [], used: [], at: this.now() };
    const additions = batch.segments.map((part, index) => ({ ...part, origin: 'model-cache', topicId: selected.topic,
      sourceEvidence: { text: selected.text, timeState: selected.timeState, eventId: selected.eventId },
      topicFinal: index === batch.segments.length - 1 && !batch.incomplete, expires: this.now() + 900000 }));
    entry.rows = [...entry.rows.filter(row => !additions.some(part => part.id === row.id)), ...additions].slice(-6);
    this.save(data);
  }
  consume(input, id, text) {
    const data = this.read(), entry = data.entries[this.key(input)]; if (!entry) return;
    entry.rows = entry.rows.filter(row => row.id !== id);
    entry.used = [...entry.used, plain(text)].slice(-32); this.save(data);
  }
}
