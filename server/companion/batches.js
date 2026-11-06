import { randomUUID } from 'node:crypto';
import { speechProblem, SPOKEN_CONTRACT } from './speech.js';
import { hasInventedUserHistory } from './materials.js';
import { storySimilarity } from '../desktop/idle-stories.js';

const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' });
export const speechLength = text => Array.from(graphemes.segment(text)).length;
export function batchPrompt(selected, targets, { grounded, heard = [], previous = [] } = {}) {
  return SPOKEN_CONTRACT + '\n【连贯碎碎念批次】只围绕一个话题，生成1至3段各自完整、承接而不复述的直接台词。第一段开场，后续补充不同细节或感受，最后自然收尾；素材不足就少说，不凑段数。这是你主动开口，历史问题已经回答，不要重新回答旧问题。不得说“你问……”来假定玩家提问或回应。不添加原文未给的亲属、具体时间、人物关系和未给出的过去事件，不写实时身体动作、门铃等现场声响。'
    + (grounded ? '\n【唯一背景证据】' : '\n【即兴角度，只谈感受/愿望/明确假想】') + JSON.stringify({ id: selected.id, text: selected.text })
    + (grounded ? '\n第一段必须点出本次素材的一项具体事实，后面只能补充这件事的感受。不要从别的已讲故事借细节。' : '\n本批不能回忆任何过去事件，只谈眼下感受、愿望或明确假想。')
    + '\n【已经展示的本话题台词，不可再说】' + JSON.stringify(heard)
    + '\n【其他话题仅作去重，不能复述或借来填充当前话题】' + JSON.stringify(previous.slice(-6).map(line => line.slice(0, 55)))
    + '\n【每段字数目标，含标点】' + JSON.stringify(targets)
    + '\n长档每段尽量写75–90个中文显示字符，通常3至4句；短档每段25–40字符，通常1至2句。不要把50字长档误写成二三十字短句。先检查各段是否达到各自最低字数。'
    + '\n仅返回JSON：{"segments":[{"text":"完整口语台词。"}]}。数组至多3项，按顺序对应字数目标；每段都须完整收尾，不配图，不加Markdown代码围栏。来源id由本地绑定，不要自行输出证据编号或添加人物名标签。';
}
export function batchGroundingProblem(batch, selected, catalog) {
  const text = batch.segments.map(row => row.text).join('');
  if (!batch.grounded) return /小时候|曾经|有一年|有一回|有一次|那次|当年|学生时|大学时/u.test(text) ? 'creative-past-event' : null;
  let score = storySimilarity(text, selected.text);
  const short = selected.text.replace(/[\p{P}\p{S}\s]/gu, '');
  if (short.length < 12) {
    const hits = [...short].slice(0, -1).filter((_, i) => text.includes(short.slice(i, i + 2))).length;
    if (hits >= Math.max(1, Math.ceil(short.length / 4))) score = Math.max(score, .4);
  }
  const other = catalog.filter(row => row.topic !== selected.topic && !(row.baseKey && row.baseKey === selected.baseKey))
    .reduce((best, row) => Math.max(best, storySimilarity(text, row.text)), 0);
  return score < .16 || other > .36 && other > score + .12 ? 'wrong-source' : null;
}
export function parseSpeechBatch(text, { selected, targets, grounded, name, history = [] }) {
  let data;
  try { data = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/giu, '')); } catch { throw new Error('batch-json'); }
  if (!Array.isArray(data?.segments) || !data.segments.length || data.segments.length > 3) throw new Error('batch-count');
  const seen = new Set(), batchId = randomUUID();
  const segments = [];
  for (const [i, row] of data.segments.entries()) {
    try {
    if (typeof row?.text !== 'string' || row.evidenceIds !== undefined && !Array.isArray(row.evidenceIds) || !targets[i]) throw new Error('batch-shape');
    const value = row.text.trim(), length = speechLength(value), target = targets[i];
    if (length < target.minChars || length > target.maxChars || !/[。！？.!?…][”」』）)]?$/u.test(value)) throw new Error('batch-length:段' + (i + 1) + '实际' + length + '字,要求' + target.minChars + '至' + target.maxChars + '字且完整句末');
    if (speechProblem(value, name) || hasInventedUserHistory(value, history)) throw new Error('batch-speech');
    const evidenceIds = row.evidenceIds ?? (grounded ? [selected.id] : []);
    if (grounded ? evidenceIds.length !== 1 || evidenceIds[0] !== selected.id : evidenceIds.length !== 0) throw new Error('batch-evidence');
    const normalized = value.replace(/[\p{P}\p{S}\s]/gu, '');
    if (seen.has(normalized)) throw new Error('batch-repeat'); seen.add(normalized);
    segments.push({ id: batchId + ':' + i, text: value, evidenceIds, target, index: i });
    } catch (e) { e.prefix = segments; e.batchId = batchId; throw e; }
  }
  return { id: batchId, topicId: selected.topic, grounded, segments };
}
