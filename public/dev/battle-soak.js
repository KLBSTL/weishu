// Continuous real-runner replay, opened through battle-perf.html?suite=<capture directory>.
// Inputs: tools/capture-specs.mjs --all --out public/dev/perf/<directory>.
// Each field runs to completion; dispose both simulation and rendering before moving on.
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { createFieldView } from '../js/render/app.js';
import { createBattleRunner } from '../js/battle/runner.js';
import { frameFigures, round } from './frame-stats.js';

const $ = id => document.getElementById(id);
const heap = () => performance.memory ? round(performance.memory.usedJSHeapSize / 1048576, 1) : null;

function measure(runner, view, stopped, maxMs) {
  const frames = [];
  const start = performance.now(), initial = { ...runner.stats() };
  let last = start, tasks = 0, taskMs = 0, peakUnits = 0;
  const beforeHeap = heap();
  let observer;
  try {
    observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) { tasks++; taskMs += entry.duration; } });
    observer.observe({ type: 'longtask' });
  } catch { /* not supported */ }
  return new Promise(resolve => {
    const frame = now => {
      frames.push(now - last); last = now;
      const stats = view.stats();
      peakUnits = Math.max(peakUnits, stats.units);
      if (frames.length % 60 === 0) {
        $('fps').textContent = Math.round(stats.fps);
        $('f-frame').textContent = `${stats.frameMs.toFixed(1)} ms`;
        $('f-view').textContent = `${stats.cpuMs.toFixed(1)} ms`;
      }
      const done = !!runner.state()?.done;
      if (!stopped() && !done && now - start < maxMs) { requestAnimationFrame(frame); return; }
      observer?.disconnect();
      frames.shift();
      const end = runner.stats();
      resolve({ ...frameFigures(frames, 33.4), seconds: round((now - start) / 1000, 1),
        ticks: end.ticks - initial.ticks, peakUnits, tasks, taskMs: Math.round(taskMs),
        done, beforeHeap, heap: heap(), canvas: document.querySelectorAll('#field canvas').length,
        textures: stats.board3d?.textures ?? null, viewCpuMs: stats.cpuMs,
        simMsPerTick: round((end.stepMs - initial.stepMs) / Math.max(1, end.ticks - initial.ticks), 3) });
    };
    requestAnimationFrame(frame);
  });
}

export async function startSoak(query) {
  const folder = query.get('suite');
  if (!/^[\w-]+$/.test(folder || '')) throw new Error('suite must name a capture directory under /dev/perf');
  const response = await fetch(`/dev/perf/${folder}/index.json`);
  if (!response.ok) throw new Error('先使用 capture-specs.mjs --all 生成整场回放');
  const entries = await response.json();
  if (!Array.isArray(entries) || !entries.length || entries.length > 100
      || entries.some(entry => !entry || !/^[\w-]+$/.test(entry.name))) throw new Error('回放列表无效');
  const seconds = Number(query.get('seconds'));
  const maxMs = (Number.isFinite(seconds) && seconds > 0 ? Math.max(10, Math.min(300, seconds)) : 180) * 1000;
  await data.loadAll('chess', 'tokens', 'items', 'enemies', 'stages', 'bonds', 'config');
  await assets.ready();
  const select = $('spec');
  for (const entry of entries) select.append(new Option(entry.title, entry.name));
  $('panel').classList.remove('is-collapsed');
  $('strip').parentElement.hidden = true;
  $('restart').textContent = '停止回放';
  let stopped = false, running = false;
  $('restart').onclick = () => { stopped = true; };
  $('meta').textContent = `${entries.length} 条战斗输入，逐场释放资源，每场最多采样 ${maxMs / 1000} 秒。独立回放不含服务端血池同步；堆内存未强制GC。`;
  $('measure-label').textContent = '从所选场景连续回放';
  $('measure').disabled = false;
  $('measure').onclick = async () => {
    if (running) return;
    running = true; stopped = false;
    $('measure').disabled = true; $('quality').disabled = true;
    select.disabled = true;
    const first = select.selectedIndex;
    const scheduled = entries.length - first;
    const quality = $('quality').value;
    const reports = [];
    const output = $('out');
    $('result').hidden = false;
    $('result').querySelector('details').open = true;
    $('copy').hidden = true;
    const drawReport = status => {
      output.textContent = ['整场连续回放（资源加载与战斗指标分别记录；并非联网UI测试）',
        `状态：${status}；画质：${quality}；视口：${innerWidth}×${innerHeight}；DPR：${devicePixelRatio}`,
        '场景 | 秒 | FPS | P95/P99 ms | >33ms% | 长任务 | 峰值单位 | 堆MB | 加载ms | 渲染CPU/模拟单步ms | 结束/清理画布/模型引用',
        ...reports.map(r => `${r.name} | ${r.seconds} | ${r.fps} | ${r.p95}/${r.p99} | ${r.over33} | ${r.tasks} | ${r.peakUnits} | ${r.beforeHeap}→${r.heap} | ${r.loadMs} | ${r.viewCpuMs}/${r.simMsPerTick} | ${r.done}/${r.remainingCanvas}/${r.remainingRefs}`),
      ].join('\n');
    };
    try {
      for (let i = first; i < entries.length && !stopped; i++) {
        const entry = entries[i];
        select.value = entry.name;
        $('meta').textContent = `${i + 1}/${entries.length} · ${entry.title}`;
        $('measure-label').textContent = `回放中 ${i + 1}/${entries.length}`;
        drawReport('进行中');
        let runner, view;
        const loadStart = performance.now();
        try {
          const response = await fetch(`/dev/perf/${folder}/${encodeURIComponent(entry.name)}.json`);
          if (!response.ok) throw new Error(`场景读取失败：${entry.name}`);
          const msg = await response.json();
          view = await createFieldView($('field'), { data, assets, settings: { quality, damageNumbers: true } });
          view.setStage(data.lookup('stages', msg.spec.stageId));
          runner = createBattleRunner({ net: { on: () => () => {}, send() {}, request: async () => ({ ok: true }) }, store: null });
          runner.on('field', field => { view.enterBattle(field); view.setCamera(msg.kind === 'hidden' ? 'boss' : msg.kind, { rect: field.rect, side: 'L', instant: true }); });
          runner.on('snap', snap => view.pushSnapshot(snap));
          runner.on('ev', events => view.pushEvents(events));
          await runner.onStart({ ...msg, elapsed: 0, authoritative: true, watch: false, done: false });
          const loadMs = Math.round(performance.now() - loadStart);
          reports.push({ name: entry.name, loadMs, ...await measure(runner, view, () => stopped, maxMs) });
        } finally {
          runner?.dispose(); view?.destroy();
        }
        reports.at(-1).remainingCanvas = document.querySelectorAll('#field canvas').length;
        reports.at(-1).remainingRefs = assets.spine.stats().refs;
        const last = reports.at(-1);
        $('r-fps').textContent = last.fps;
        $('r-p95').textContent = `${last.p95} ms`;
        $('r-over').textContent = `${last.over33}%`;
        $('f-sim').textContent = `${last.simMsPerTick} ms`;
        drawReport('进行中');
      }
      const limited = reports.filter(report => !report.done).length;
      const status = stopped ? '已停止' : limited ? `采样完成，${limited} 场达到采样上限（未判定战斗结束）` : '全部战斗回放完成';
      $('verdict').textContent = status;
      $('measure-label').textContent = '从所选场景重新回放';
      $('meta').textContent = `${reports.length}/${scheduled} 场，当前战场画布 ${document.querySelectorAll('#field canvas').length} 个`;
      drawReport(status);
    } catch (error) {
      drawReport(`失败：${error.message}`);
      $('meta').textContent = error.message;
      console.error(error);
    } finally {
      running = false; $('measure').disabled = false; $('quality').disabled = false; select.disabled = false;
    }
  };
}
