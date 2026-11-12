import { Worker } from 'node:worker_threads';
import { fingerprint } from './materials.js';

const cache = new Map(); let bytes = 0;
/** One compilation per immutable profile revision; bounded by both cardinality and bytes. */
export async function compileProfile(profile) {
  const key = [profile.library?.directory, profile.actorId, profile.revision, profile.characterId, fingerprint(profile.state || {})].join(':');
  if (cache.has(key)) { const item = cache.get(key); cache.delete(key); cache.set(key, item); return structuredClone(await item.promise); }
  const item = { bytes: 0 };
  item.promise = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./compiler-worker.js', import.meta.url), { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128 } });
    let done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); void worker.terminate(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('资料整理耗时过长，请缩小资料后重试。')), 10000);
    worker.once('error', () => finish(new Error('人物资料编译暂时失败。')));
    worker.once('message', message => finish(message.error && new Error(message.error), message.value));
    worker.postMessage({ id: key, card: profile.card, state: profile.state || {} });
  });
  cache.set(key, item);
  try {
    const value = await item.promise; item.bytes = Buffer.byteLength(JSON.stringify(value)); if (cache.get(key) === item) bytes += item.bytes;
    while ((bytes > 32 * 1024 * 1024 || cache.size > 12) && cache.size) { const oldest = cache.keys().next().value; bytes -= cache.get(oldest).bytes; cache.delete(oldest); }
    return structuredClone(value);
  } catch (e) { cache.delete(key); throw e; }
}
