// Opt-in real-network diagnostics: open /?profile=1 on localhost, then play normally.
// Only aggregate timings/counts are displayed. No names, room keys, tokens or battle specs.
import { frameFigures } from './frame-stats.js';

export function installLiveProfile({ store, net }) {
  const box = document.createElement('details');
  box.id = 'live-profile';
  box.style.cssText = 'position:fixed;z-index:20000;left:8px;top:52px;max-width:min(680px,95vw);max-height:65vh;overflow:auto;background:#101820ef;color:#d9ffff;padding:8px;font:11px monospace;pointer-events:auto';
  const title = document.createElement('summary');
  title.textContent = '本机性能诊断（展开查看）';
  const output = document.createElement('pre');
  output.style.cssText = 'white-space:pre-wrap;margin:8px 0 0';
  box.append(title, output); document.body.append(box);
  const rows = [], tasks = [], resources = [];
  let current, last = 0, raf, timer, disposed = false, lastPublic = 0, maxPublicGap = 0;
  const round = value => Math.round(value * 10) / 10;
  const keyOf = () => {
    const pub = store.get().match?.public;
    return pub ? `${pub.round}:${pub.phase}` : 'LOBBY';
  };
  const change = () => {
    const key = keyOf();
    if (current?.key === key) return;
    current = { key, start: performance.now(), frames: [], count: 0, total: 0, over: 0, max: 0, tasks: 0, taskMax: 0 };
    rows.push(current); if (rows.length > 24) rows.shift();
    last = 0; lastPublic = 0; maxPublicGap = 0;
  };
  const observer = (type, fn) => {
    try { const o = new PerformanceObserver(list => list.getEntries().forEach(fn)); o.observe({ type, buffered: true }); return o; }
    catch { return null; }
  };
  change();
  const longObserver = observer('longtask', entry => {
    const owner = rows.findLast(r => r.start <= entry.startTime);
    const item = { at: round(entry.startTime), ms: round(entry.duration), phase: owner?.key || 'BOOT' };
    tasks.push(item); if (tasks.length > 30) tasks.shift();
    if (owner && document.visibilityState !== 'hidden') {
      owner.tasks++; owner.taskMax = Math.max(owner.taskMax, entry.duration);
    }
  });
  const resourceObserver = observer('resource', entry => {
    if (entry.duration < 50) return;
    const path = new URL(entry.name).pathname;
    if (!/^\/(vendor|assets|local|sim|data|js)\//.test(path)) return;
    resources.push({ path, at: round(entry.startTime), ms: round(entry.duration), kb: round(entry.transferSize / 1024) });
    resources.sort((a, b) => b.ms - a.ms); resources.length = Math.min(resources.length, 12);
  });
  const offStore = store.subscribe(change);
  const offPublic = net.on('m.public', () => {
    const now = performance.now();
    if (lastPublic && document.visibilityState !== 'hidden') maxPublicGap = Math.max(maxPublicGap, now - lastPublic);
    lastPublic = now;
  });
  const visibility = () => { last = 0; lastPublic = 0; };
  document.addEventListener('visibilitychange', visibility);
  const frame = now => {
    if (disposed) return;
    if (document.visibilityState !== 'hidden' && last) {
      const dt = now - last;
      current.count++; current.total += dt; current.max = Math.max(current.max, dt);
      if (dt > 33.4) current.over++;
      current.frames.push(dt); if (current.frames.length > 12000) current.frames.shift();
    }
    last = now; raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const draw = () => {
    const stats = globalThis.__SP_VIEW__?.raw?.stats?.();
    const figures = rows.map(r => {
      if (r.sampleCount !== r.count) {
        r.sample = r.frames.length > 1 ? frameFigures([...r.frames], 33.4) : {};
        r.sampleCount = r.count;
      }
      const sample = r.sample || {};
      return { phase: r.key, frames: r.count, fps: r.total ? round(1000 * r.count / r.total) : null,
        p95: sample.p95 ?? null, max: round(r.max), over33: r.count ? round(100 * r.over / r.count) : 0,
        longTasks: r.tasks, taskMax: round(r.taskMax) };
    });
    output.textContent = JSON.stringify({ note: '仅可见页面帧；P95最多保留最近12000帧。长任务/资源列表最多30/12项；资源耗时不等于主线程耗时。',
      visible: document.visibilityState, ping: net.ping, maxPublicGapMs: round(maxPublicGap),
      renderer: stats ? { fps: round(stats.fps), cpuMs: round(stats.cpuMs), units: stats.units } : null,
      phases: figures, longTasks: tasks, slowResources: resources }, null, 2);
  };
  draw(); timer = setInterval(draw, 1000);
  const dispose = () => {
    disposed = true; cancelAnimationFrame(raf); clearInterval(timer);
    offStore(); offPublic(); longObserver?.disconnect(); resourceObserver?.disconnect();
    document.removeEventListener('visibilitychange', visibility); box.remove();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
