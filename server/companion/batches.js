import { randomUUID } from 'node:crypto';
import { speechProblem, SPOKEN_CONTRACT } from './speech.js';
import { hasInventedUserHistory } from './materials.js';
import { storySimilarity } from '../desktop/idle-stories.js';
import { DAILY_EXTENSION_POLICY, knowledgeProblem, extensionProposals } from './knowledge.js';
import { speechLength, sentenceParts, completeSpeech } from './sentence-parts.js';

export { speechLength } from './sentence-parts.js';
export function batchPrompt(selected, targets, { grounded, heard = [], contracts = true } = {}) {
  const text = heard.length && selected.remainingPoints?.length ? selected.remainingPoints.map(point => point.text).join('。') : selected.text;
  return (contracts ? SPOKEN_CONTRACT + DAILY_EXTENSION_POLICY : '') + '\n【连贯碎碎念批次】生成400字以上、约500字的完整连贯口语正文，450至650字是写作偏好。只负责内容，不预先分气泡，不要求段数；本机会按完整句子切分。围绕一个话题的不同细节或感受展开，自然收尾。素材不足就自然结束，不凑字、不扩写无意义属性。这是你主动开口，历史问题已经回答，不要重新回答旧问题。不得说“你问……”来假定玩家提问或回应，也不替玩家说话。不添加原文未给的重大身世、人物关系，不写实时身体动作、门铃等现场声响。'
    + (grounded ? '\n【唯一背景证据】' : '\n【即兴角度，只谈感受/愿望/明确假想】') + JSON.stringify({ id: selected.id, text })
    + (grounded ? heard.length ? '\n这是接续，不要重新介绍事件或重报已讲事实。从最后实际展示的话往后补充未讲细节，没新内容就自然收尾。' : '\n第一段点出本次素材的一项具体事实，后面补充这件事的不同细节、感受或不冲突的日常小事。不要从别的已讲故事借细节。' : '\n本批围绕新的日常小事、感受或愿望展开，不能凭空增加重大过去事件。')
    + '\n【本事件已展示段数】' + heard.length + (heard.length ? '\n【最近已展示台词，仅供接续，不得改写重讲】' + JSON.stringify(heard.slice(-3).map(line => line.slice(-160))) : '')
    + '\n【事件边界】' + JSON.stringify({ eventId: selected.eventId, timeState: selected.timeState, subjects: selected.subjects, factIds: selected.factIds, anchors: selected.anchors, angles: selected.angles })
    + '\n【先判断是否还有新内容】先比对同一持久会话的已展示历史与预留话题。如果本次素材只是已讲事件/习惯的另一个来源，不得重讲同一要点，也不得仅换比喻、动作或感受来凑400字。没有可补的新内容时，只返回{"skipTopic":true}，本机会换素材；这不会把未播内容记为已讲。存在新要点时直接生成正文，不重复旧介绍。'
    + '\n仅返回JSON：{"text":"完整连贯口语正文。"}。以完整句末收尾，不配图、不加Markdown围栏。来源id由本地绑定，不自行输出证据编号或人物名标签。';
}
export function batchGroundingProblem(batch, selected, catalog) {
  const text = batch.segments.map(row => row.text).join('');
  if (!batch.grounded) return /小时候|当年|学生时|大学时/u.test(text) ? 'creative-past-event' : null;
  let score = storySimilarity(text, selected.text);
  if (selected.anchors?.some(anchor => text.includes(anchor))) score = Math.max(score, .25);
  const short = selected.text.replace(/[\p{P}\p{S}\s]/gu, '');
  if (short.length < 12) {
    const hits = [...short].slice(0, -1).filter((_, i) => text.includes(short.slice(i, i + 2))).length;
    if (hits >= Math.max(1, Math.ceil(short.length / 4))) score = Math.max(score, .4);
  }
  const other = catalog.filter(row => row.topic !== selected.topic && !(row.baseKey && row.baseKey === selected.baseKey))
    .reduce((best, row) => Math.max(best, storySimilarity(text, row.text)), 0);
  return score < .16 || other > .36 && other > score + .12 ? 'wrong-source' : null;
}
export function parseSpeechBatch(text, { selected, targets = [], grounded, name, history = [], card, manual = false }) {
  let data;
  try { data = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/giu, '')); } catch { throw new Error('batch-json'); }
  if (data?.skipTopic === true && data.text === undefined && data.segments === undefined) throw new Error('batch-covered');
  const legacy = Array.isArray(data?.segments) ? data.segments : null;
  if (legacy && (!legacy.length || legacy.some(row => typeof row?.text !== 'string'))) throw new Error('batch-shape');
  if (typeof data?.text !== 'string' && !legacy) throw new Error('batch-shape');
  if (typeof data.text === 'string' && legacy) throw new Error('batch-shape');
  const fullText = (typeof data.text === 'string' ? data.text : legacy.map(row => row.text.trim()).join('')).trim();
  if (!fullText || speechLength(fullText) > 6000) throw new Error('batch-output-budget');
  if (speechProblem(fullText, name) || hasInventedUserHistory(fullText, history)) throw new Error('batch-speech');
  const wholeProblem = card && knowledgeProblem(fullText, card, selected.text);
  if (wholeProblem) throw new Error('batch-' + wholeProblem);
  if (legacy) {
    const values = legacy.map(row => row.text.replace(/[\p{P}\p{S}\s]/gu, ''));
    if (new Set(values).size !== values.length) throw new Error('batch-repeat');
    for (const row of legacy) if (row.evidenceIds !== undefined && (!Array.isArray(row.evidenceIds)
      || (grounded ? row.evidenceIds.length !== 1 || row.evidenceIds[0] !== selected.id : row.evidenceIds.length))) throw new Error('batch-evidence');
  }
  // Preserve valid old cached boundaries/IDs on replay; malformed lengths are regrouped, never truncated.
  const natural = sentenceParts(fullText, { preferredMinChars: manual ? 60 : 70, preferredMaxChars: 100 });
  let offset = 0;
  const parts = legacy && legacy.every(row => completeSpeech(row.text) && speechLength(row.text) >= 20 && speechLength(row.text) <= 100)
    ? legacy.map(row => { const value = row.text.trim(), start = offset; offset += value.length; return { text: value, start, end: offset }; })
    : natural;
  const seen = new Set(), batchId = randomUUID();
  const segments = [];
  for (const [i, row] of parts.entries()) {
    try {
    const value = row.text.trim(), target = { preferredMinChars: manual ? 60 : 70, preferredMaxChars: 100, ...targets[i], minChars: 1, maxChars: null };
    if (!completeSpeech(value)) throw new Error('batch-length:正文没有完整句末');
    if (speechProblem(value, name) || hasInventedUserHistory(value, history)) throw new Error('batch-speech');
    const problem = card && knowledgeProblem(value, card, selected.text); if (problem) throw new Error('batch-' + problem);
    const evidenceIds = grounded ? [selected.id] : [];
    if (grounded ? evidenceIds.length !== 1 || evidenceIds[0] !== selected.id : evidenceIds.length !== 0) throw new Error('batch-evidence');
    const normalized = value.replace(/[\p{P}\p{S}\s]/gu, '');
    if (seen.has(normalized)) throw new Error('batch-repeat'); seen.add(normalized);
    segments.push({ id: batchId + ':' + i, text: value, sourceRange: { start: row.start, end: row.end }, evidenceIds, target, index: i,
      eventId: selected.eventId, factIds: selected.factIds || evidenceIds, angleId: (selected.angles || ['event', 'feeling', 'reflection'])[i],
      informationPoints: (selected.factPoints || []).filter(point => storySimilarity(value, point.text) >= .42 || value.includes(point.text)).map(point => ({ ...point })),
      extensionProposals: card ? extensionProposals(value, card, selected.text) : [] });
    } catch (e) { e.prefix = segments; e.batchId = batchId; throw e; }
  }
  return { id: batchId, topicId: selected.topic, grounded, text: fullText, underTarget: speechLength(fullText) < 400,
    generationKind: grounded ? 'background-story' : 'creative-idle', segmentationVersion: 1, segments };
}
