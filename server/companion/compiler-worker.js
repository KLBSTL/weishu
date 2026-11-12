import { parentPort } from 'node:worker_threads';
import { compileKnowledge } from './knowledge.js';
import { compileCard } from './materials.js';

parentPort.on('message', ({ id, card, state }) => {
  try { parentPort.postMessage({ id, value: { knowledge: compileKnowledge(card, { state }), materials: compileCard(card, { state }) } }); }
  catch { parentPort.postMessage({ id, error: '人物资料编译失败，请检查资料格式。' }); }
});
