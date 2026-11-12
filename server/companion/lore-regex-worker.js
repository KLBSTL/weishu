import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ rules, text }) => {
  const result = rules.map(({ key, pattern, flags }) => {
    try { return { key, matched: new RegExp(pattern, flags.replace(/[gy]/gu, '')).test(text) }; }
    catch { return { key, error: 'invalid-regex' }; }
  });
  parentPort.postMessage(result);
});
