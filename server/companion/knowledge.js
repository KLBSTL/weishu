import { compileCard, fingerprint } from './materials.js';
import { storySimilarity } from '../desktop/idle-stories.js';

export const DAILY_EXTENSION_POLICY = '【互动经历规则】允许补充与人物不冲突的日常小事、感受和愿望；新增小事属于互动扩展，不冒充原卡。重大身世、年龄、职业、亲属和恋爱关系遵守原卡。愿望不当成已经发生，旧事不说成正在等待发生。不虚构电脑操作或游戏已成交动作。';
const cache = new Map();
const normalize = value => String(value || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
export const utteranceKey = value => fingerprint(normalize(value));
export function preferenceClaim(text) {
  if (/如果|假如|要是|他说|她说|你说|例如|故事里/u.test(text)) return null;
  const color = /我(?:现在|其实|更|已经|改成|改为|改)?(?:更)?喜欢(?:的)?(?:是)?(蓝色|红色|绿色|黄色|白色|黑色|紫色)(围巾|衣服|杯子|本子)/u.exec(text);
  return color ? { slot: 'color:' + color[2], value: color[1] } : null;
}
export function compileKnowledge(card) {
  const key = fingerprint(card || {}); if (cache.has(key)) return cache.get(key);
  const compiled = compileCard(card);
  const byId = new Map();
  for (const unit of compiled.units) {
    const sourceRef = { revision: compiled.revision, ...unit.evidence }, previous = byId.get(unit.id);
    // IDs identify the same path/title/text. Repeated paragraphs are one fact with multiple locations.
    if (previous) { (previous.sourceRefs ||= [previous.sourceRef]).push(sourceRef); continue; }
    byId.set(unit.id, { factId: unit.id, eventId: fingerprint([unit.ownership, normalize(unit.text)]).slice(0, 24),
      kind: unit.kind === 'conditional' ? 'condition' : unit.facet === 'personality' ? 'preference' : /小时候|曾经|有一次|那年|学生时/u.test(unit.text) ? 'past' : 'description',
      subjectIds: unit.subject ? [unit.subject] : unit.ownership === 'self' ? [compiled.speaker?.name] : [],
      knownBy: unit.ownership === 'self' ? [compiled.speaker?.name] : [], visibility: unit.ownership === 'world' ? 'world' : 'actor_private',
      timeState: unit.kind === 'conditional' ? 'hypothetical' : /小时候|曾经|有一次|那年|学生时/u.test(unit.text) ? 'past' : 'unknown',
      ownership: unit.ownership, text: unit.text, sourceRef, status: unit.kind === 'conditional' ? 'conditional' : 'active' });
  }
  const facts = [...byId.values()];
  const value = { revision: key, speaker: compiled.speaker, facts };
  if (cache.size >= 24) cache.delete(cache.keys().next().value); cache.set(key, value); return value;
}
const major = ['结婚', '离婚', '怀孕', '去世', '病逝', '死亡', '收养', '失忆', '继承', '退学', '入狱', '恋人', '男朋友', '女朋友'];
export function knowledgeProblem(text, card, source = '') {
  const knowledge = compileKnowledge(card), canon = knowledge.facts.filter(f => ['self', 'world'].includes(f.ownership)).map(f => f.text).join('\n') + source;
  if (/(?:我|我的|父亲|母亲|奶奶|爷爷|哥哥|姐姐|弟弟|妹妹).{0,20}/u.test(text)) {
    for (const word of major) if (text.includes(word) && !canon.includes(word) && !/如果|假如|要是|想象|希望/u.test(text)) return 'unsupported-major:' + word;
    for (const relation of ['哥哥', '姐姐', '弟弟', '妹妹', '丈夫', '妻子', '儿子', '女儿']) if (new RegExp('(?:我的?|和我)(?:亲)?' + relation, 'u').test(text) && !canon.includes(relation)) return 'unsupported-relation';
  }
  const age = /我(?:今年|已经)?\s*(\d{1,3})\s*岁/u.exec(text);
  if (age && !canon.includes(age[1])) return 'unsupported-age';
  for (const match of canon.matchAll(/(?:从不|不喜欢|讨厌|不喝|不能喝)[^。！？\n]{0,6}(咖啡|酒|牛奶|茶)/gu)) {
    if (new RegExp('(?:喝了|泡了|每天喝|喜欢喝|尝了)[^。！？]{0,5}' + match[1], 'u').test(text)) return 'preference-conflict';
  }
  if (/小时候|曾经|那年|学生时/u.test(source) && /现在.{0,8}(?:还在等|等着|尚未|还没).{0,12}(?:完成|烧好|寄出|回来|开窑)/u.test(text)) return 'past-became-pending';
  return null;
}
export function extensionProposals(text, card, source = '') {
  if (knowledgeProblem(text, card, source) || /如果|假如|想试|希望|打算|想象|要是|准备/u.test(text)
    || /这轮|本轮|LP|漏怪|购买干员|击杀|已部署/u.test(text)) return [];
  return /我.{0,24}(?:试了|做了|买了|整理|读了|喝了|泡了|收拾|看了|尝了|揉面|折纸)/u.test(text)
    ? [{ kind: 'extension', text, timeState: 'past', source: 'displayed_interaction' }] : [];
}
export function memoryPrompt(rows = []) {
  return rows.length ? '\n【相关已展示记忆，按来源区分；原话不自动等于原卡正史】\n' + rows.slice(0, 8)
    .map(row => `[${row.kind}；来源${row.sourceId}]${row.text.slice(0, 320)}`).join('\n') + '\n只用回答本次问题所需内容；尊重纠正后的记录，不重答旧问题。' : '';
}
/** Event annotations retain real ownership/time/evidence instead of trusting model-supplied IDs. */
export class StoryPlanner {
  catalog(card, rows, knowledge = compileKnowledge(card)) {
    return rows.map(row => {
      const candidates = knowledge.facts.filter(f => f.status === 'active' && ['self', 'world'].includes(f.ownership))
        .map(fact => ({ fact, score: normalize(row.text).includes(normalize(fact.text)) || normalize(fact.text).includes(normalize(row.text)) ? 1 : storySimilarity(row.text, fact.text) }))
        .filter(x => x.score >= .4).sort((a, b) => b.score - a.score).slice(0, 3);
      const eventId = candidates[0]?.fact.eventId || row.topic;
      return { ...row, legacyTopic: row.topic, topic: row.angle ? fingerprint([eventId, row.angle]).slice(0, 24) : eventId, eventId, factIds: candidates.map(x => x.fact.factId),
        timeState: candidates[0]?.fact.timeState || 'unknown', subjects: candidates.flatMap(x => x.fact.subjectIds),
        evidence: candidates.map(x => x.fact.sourceRef) };
    });
  }
}
