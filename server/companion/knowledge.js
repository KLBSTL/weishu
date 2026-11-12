import { compileCard, fingerprint, MATERIAL_VERSION } from './materials.js';
import { storySimilarity } from '../desktop/idle-stories.js';
import { indexFacts, factText, FACT_INDEX_VERSION } from './fact-index.js';
import { labelledProfileLine, profileLabel, sourceHeading } from './source-types.js';

export const DAILY_EXTENSION_POLICY = '【互动经历规则】允许补充与人物不冲突的日常小事、感受和愿望；新增小事属于互动扩展，不冒充原卡。重大身世、年龄、职业、亲属和恋爱关系遵守原卡。愿望不当成已经发生，旧事不说成正在等待发生。不虚构电脑操作或游戏已成交动作。';
const cache = new Map();
const normalize = value => String(value || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
export function materialType(text, title = '') {
  const role = sourceHeading(title) || sourceHeading(String(text).split('\n')[0]);
  if (role) return role.role === 'author' ? 'program' : 'voice';
  if (/变量更新|输出协议|数值指导|初始化|TavernHelper|<%|<script|MVU/iu.test(text + title)) return 'program';
  if (profileLabel(title) || labelledProfileLine(String(text).split('\n')[0])) return 'attribute';
  if (/有一次|曾经|那年|小时候|学生时|第一次|有一年|当年/u.test(text)) return 'event';
  // A short label/value is an attribute even when its label was never added to
  // a vocabulary list (e.g. 居住地、家庭成员). Narratable prose remains separate.
  if (!/喜欢|爱好|习惯|经常|每天/u.test(text + title) && String(text).length < 120
    && /^\s*(?:[-*]\s*)?[^\n:：]{1,24}[:：][^。！？\n]+$/u.test(text)) return 'attribute';
  const lines = String(text).split('\n').map(l => l.replace(/^[-*\s]+/u, '')).filter(Boolean);
  if (lines.length && lines.every(l => /^(?:姓名|性别|年龄|种族|阶位|等级|身份|职业|住处|住所|身高|体重|头发|发色|瞳色|着装|服装|外貌|外观)\s*[:：]/u.test(l))) return 'attribute';
  if (/^(?:[【\[\s]*(?:性别|种族|阶位|位阶|等级|住处|住所|居住地|家庭成员|身高|体重|身材|头发|发色|瞳色|着装|服装|外貌(?:特征)?|外观|体系与来源|现存长处|短板|神灵权能))[】\]\s]*$/u.test(title)) return 'attribute';
  if (/性格|爱好|习惯|口癖|说话|喜欢|每天|经常/u.test(title + text)) return 'habit';
  if (/地点|场景|环境/u.test(title)) return 'scene';
  return 'event';
}
export const utteranceKey = value => fingerprint(normalize(value));
export function preferenceClaim(text) {
  if (/如果|假如|要是|他说|她说|你说|例如|故事里/u.test(text)) return null;
  const color = /我(?:现在|其实|更|已经|改成|改为|改)?(?:更)?喜欢(?:的)?(?:是)?(蓝色|红色|绿色|黄色|白色|黑色|紫色)(围巾|衣服|杯子|本子)/u.exec(text);
  return color ? { slot: 'color:' + color[2], value: color[1] } : null;
}
export function compileKnowledge(card, options = {}) {
  const key = fingerprint([MATERIAL_VERSION, FACT_INDEX_VERSION, card || {}, options]); if (cache.has(key)) return cache.get(key);
  const compiled = compileCard(card, options);
  const rawFacts = [], ordinals = new Map();
  for (const unit of compiled.units) {
    const sourceRef = { revision: compiled.revision, ...unit.evidence };
    const section = [unit.path, unit.title, unit.subject || compiled.speaker?.name], ordinal = ordinals.get(JSON.stringify(section)) || 0;
    ordinals.set(JSON.stringify(section), ordinal + 1);
    rawFacts.push({ factId: unit.id, sourceKey: fingerprint([...section, ordinal]).slice(0, 24), eventId: fingerprint([unit.ownership, normalize(unit.text)]).slice(0, 24),
      sourceRole: ['mes_example', 'first_mes'].includes(unit.title) || materialType(unit.text, unit.title) === 'voice' ? 'examples' : materialType(unit.text, unit.title) === 'program' ? 'presentation' : 'facts',
      proactive: unit.proactive !== false && !['voice', 'program'].includes(materialType(unit.text, unit.title)),
      scopeKey: unit.entryId !== undefined ? fingerprint([unit.bookId, unit.entryId, unit.rule?.extensions?.ark_companion?.conditions, unit.keys, unit.secondary, unit.constant, unit.selective]) : 'character',
      kind: unit.kind === 'conditional' ? 'condition' : unit.facet === 'personality' ? 'preference' : /小时候|曾经|有一次|那年|学生时/u.test(unit.text) ? 'past' : 'description',
      subjectIds: unit.subject ? [unit.subject] : unit.ownership === 'self' ? [compiled.speaker?.name] : [],
      knownBy: unit.ownership === 'self' ? [compiled.speaker?.name] : [], visibility: unit.ownership === 'world' ? 'world' : 'actor_private',
      timeState: unit.kind === 'conditional' ? 'hypothetical' : /小时候|曾经|有一次|那年|学生时/u.test(unit.text) ? 'past' : 'unknown',
      ownership: unit.ownership, materialType: materialType(unit.text, unit.title), text: unit.text, sourceRef, status: unit.kind === 'conditional' ? 'conditional' : 'active' });
  }
  const { facts, index } = indexFacts(rawFacts, compiled.speaker);
  const objects = ['日记', '地图册', '围巾', '信', '书店', '收音机', '钢笔', '相册'];
  const entities = [...new Set([compiled.speaker?.name, ...compiled.candidates?.map(c => c.name) || [], ...objects.filter(n => facts.some(f => f.text.includes(n)))].filter(Boolean))]
    .map(name => ({ id: fingerprint([compiled.speaker?.name, name]).slice(0, 24), name, aliases: [], sourceIds: facts.filter(f => f.text.includes(name)).map(f => f.factId) }));
  for (const fact of facts) for (const match of fact.text.matchAll(/([^，。！？\s]{1,16})(?:也叫|又叫|昵称是)[“「]?([^，。！？\s”」]{1,16})/gu)) {
    const entity = entities.find(e => e.name === match[1]); if (entity && !entity.aliases.includes(match[2])) entity.aliases.push(match[2]);
  }
  const value = { revision: key, speaker: compiled.speaker, facts, entities, index };
  if (cache.size >= 24) cache.delete(cache.keys().next().value); cache.set(key, value); return value;
}
const major = ['结婚', '离婚', '怀孕', '去世', '病逝', '死亡', '收养', '失忆', '继承', '退学', '入狱', '恋人', '男朋友', '女朋友'];
export function knowledgeProblem(text, card, source = '') {
  const knowledge = compileKnowledge(card), canon = knowledge.facts.filter(f => f.ownership === 'self' && f.status === 'active').map(f => f.text).join('\n') + source;
  if (/(?:我|我的|父亲|母亲|奶奶|爷爷|哥哥|姐姐|弟弟|妹妹).{0,20}/u.test(text)) {
    for (const word of major) if (text.includes(word) && !canon.includes(word) && !/如果|假如|要是|想象|希望/u.test(text)) return 'unsupported-major:' + word;
    for (const relation of ['哥哥', '姐姐', '弟弟', '妹妹', '丈夫', '妻子', '儿子', '女儿']) if (new RegExp('(?:我的?|和我)(?:亲)?' + relation, 'u').test(text) && !canon.includes(relation)) return 'unsupported-relation';
  }
  const age = /我(?:今年|已经)?\s*(\d{1,3})\s*岁/u.exec(text);
  if (age && ![...canon.matchAll(/(\d{1,3})\s*岁/gu)].some(m => m[1] === age[1])) return 'unsupported-age';
  for (const match of canon.matchAll(/(?:从不|不喜欢|讨厌|不喝|不能喝)[^。！？\n]{0,6}(咖啡|酒|牛奶|茶)/gu)) {
    if (new RegExp('(?:喝了|泡了|每天喝|喜欢喝|尝了)[^。！？]{0,5}' + match[1], 'u').test(text)) return 'preference-conflict';
  }
  if (/小时候|曾经|那年|学生时/u.test(source) && /现在.{0,8}(?:还在等|等着|尚未|还没).{0,12}(?:完成|烧好|寄出|回来|开窑)/u.test(text)) return 'past-became-pending';
  for (const [anchor, alternatives] of [['日记', ['地图册', '相册']], ['地图册', ['日记', '相册']], ['钢笔', ['铅笔']]]) {
    if (source.includes(anchor) && alternatives.some(word => !source.includes(word) && new RegExp('(?:那本|那支|这本|这支|它是|把那本).{0,4}' + word, 'u').test(text))) return 'entity-drift';
  }
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
    const result = rows.flatMap(row => {
      const text = factText(row.text, knowledge.speaker?.name);
      const possible = knowledge.facts.filter(f => f.status === 'active' && f.proactive !== false && ['self', 'world'].includes(f.ownership));
      const exact = possible.filter(f => f.canonicalText === text);
      const ranked = (exact.length ? exact : possible).map(fact => ({ fact, score: exact.length ? 1 : storySimilarity(row.text, fact.text) }))
        .filter(x => x.score >= .4).sort((a, b) => b.score - a.score).slice(0, 3);
      const variants = exact.length > 1 ? exact.map(fact => [{ fact, score: 1 }]) : [ranked.filter(x => x.fact.eventId === ranked[0]?.fact.eventId)];
      return variants.map(candidates => {
        const eventId = candidates[0]?.fact.eventId || row.topic;
        const factPoints = row.text.split(/[。！？；\n]/u).map(t => t.trim()).filter(t => t.length >= 8).map(text => ({ id: fingerprint([eventId, normalize(text)]).slice(0, 24),
          legacyId: fingerprint([knowledge.speaker?.name, normalize(text)]).slice(0, 24), text, sourceIds: candidates.map(x => x.fact.factId) }));
        return { ...row, factPoints, materialType: candidates[0]?.fact.materialType || materialType(row.text), legacyTopic: row.topic,
          topicAliases: [row.topic, ...candidates.flatMap(x => x.fact.eventAliases || [])],
          topic: row.angle ? fingerprint([eventId, row.angle]).slice(0, 24) : eventId, eventId, factIds: candidates.map(x => x.fact.factId),
          anchors: (knowledge.entities || []).filter(e => row.text.includes(e.name)).map(e => e.name),
          angles: candidates[0]?.fact.timeState === 'past' ? ['event', 'detail', 'reflection'] : ['habit', 'feeling', 'wish'],
          timeState: candidates[0]?.fact.timeState || 'unknown', subjects: candidates.flatMap(x => x.fact.subjectIds),
          evidence: candidates.flatMap(x => x.fact.sourceRefs || [x.fact.sourceRef]) };
      });
    });
    const owners = new Map();
    for (const row of result) for (const alias of row.topicAliases) (owners.get(alias) || owners.set(alias, new Set()).get(alias)).add(row.topic);
    for (const row of result) row.topicAliases = row.topicAliases.filter(alias => owners.get(alias).size === 1);
    const points = new Map();
    for (const row of result) for (const point of row.factPoints) (points.get(point.legacyId) || points.set(point.legacyId, new Set()).get(point.legacyId)).add(point.id);
    for (const row of result) for (const point of row.factPoints) point.aliases = points.get(point.legacyId).size === 1 ? [point.legacyId] : [];
    return [...new Map(result.map(row => [row.topic, row])).values()];
  }
}
