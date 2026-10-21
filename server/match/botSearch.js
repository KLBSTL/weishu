// Budgeted stochastic beam search over PREP transactions. No callbacks mutate the official state.
import { deriveSeed } from '../sim/rng.js';
import { forkPrep, legalPrepActions, applyPrepAction, prepSignature } from './botEnvironment.js';

export const actionKey = a => `${a.type}:${a.slot ?? a.uid ?? ''}:${a.id || ''}`;
const value = result => typeof result === 'number' ? result : result.score;
const aggregate = values => values.reduce((s, x) => s + x, 0) / values.length * .75 + Math.min(...values) * .25;

/** One yielded step per evaluated child. Fixed node budgets, not timing, determine the result. */
export function* searchPrepSteps(m, ps, { evaluate, rank = (_, __, actions) => actions, depth = 3, width = 4,
  maxNodes = 24, samples = 2, rootLimit = 5, cancelled = () => false } = {}) {
  if (typeof evaluate !== 'function') throw new TypeError('search requires an evaluator');
  if (![depth,width,maxNodes,samples,rootLimit].every(n => Number.isInteger(n) && n > 0) || maxNodes < samples) throw new RangeError('invalid search budget');
  const signature = prepSignature(m, ps), branches = new Set(), rejected = [], records = [];
  const groups = new Map(); let nodes = 0;
  const make = (source, who, opts) => { const b = forkPrep(source, who, opts); branches.add(b); return b; };
  const dispose = b => { b.dispose(); branches.delete(b); };
  const accept = (b, path, sample, result) => {
    const key = path.length ? actionKey(path[0]) : 'stop::', score = value(result);
    if (!Number.isFinite(score) || b.m.errorCount || b.m.dispatcher.errors) return false;
    let g = groups.get(key); if (!g) groups.set(key, g = Array(samples).fill(null));
    if (!g[sample] || score > g[sample].score) g[sample] = { path, score, result, sample };
    records.push({ first: key, sample, path, score, ...(typeof result === 'object' ? { features: result.features } : {}) });
    return true;
  };
  try {
    const roots = [];
    for (let sample = 0; sample < samples; sample++) {
      const b = make(m, ps, { seed: deriveSeed(m.seed, `prep-search:${m.round}:${ps.seat}:${sample}`) });
      const result = evaluate(b.m, b.ps); accept(b, [], sample, result);
      roots.push({ b, path: [], sample, score: value(result) });
    }
    // Every first action is evaluated under every sample before it is eligible to beat Stop.
    const rootActions = rank(roots[0].b.m, roots[0].b.ps, legalPrepActions(roots[0].b.m, roots[0].b.ps))
      .filter(a => a.type !== 'stop').slice(0, Math.min(rootLimit, Math.floor(maxNodes / samples)));
    let frontier = [];
    for (const action of rootActions) for (const root of roots) {
      if (cancelled()) return { cancelled: true, signature, nodes, candidates: records, rejected };
      const b = make(root.b.m, root.b.ps, { continuation: true }), applied = applyPrepAction(b.m, b.ps, action); nodes++;
      if (!applied?.ok) { rejected.push({ action, error: applied?.error || 'REFUSED' }); dispose(b); }
      else {
        const result = evaluate(b.m, b.ps);
        if (accept(b, [action], root.sample, result)) frontier.push({ b, path: [action], sample: root.sample, score: value(result) });
        else dispose(b);
      }
      yield;
    }
    for (let d = 2; d <= depth && nodes < maxNodes && frontier.length; d++) {
      // Keep at least one state per first action/sample before filling the spare beam slots.
      const next = [], quota = Math.min(width, Math.floor((maxNodes - nodes) / frontier.length));
      if (!quota) break; // do not give an earlier first action more sampled futures than a later one
      for (const node of frontier) {
        const actions = rank(node.b.m, node.b.ps, legalPrepActions(node.b.m, node.b.ps)).filter(a => a.type !== 'stop');
        for (const action of actions.slice(0, quota)) {
          if (nodes >= maxNodes) break;
          if (cancelled()) return { cancelled: true, signature, nodes, candidates: records, rejected };
          const b = make(node.b.m, node.b.ps, { continuation: true }), applied = applyPrepAction(b.m, b.ps, action); nodes++;
          if (!applied?.ok) { rejected.push({ action, error: applied?.error || 'REFUSED' }); dispose(b); }
          else {
            const path = [...node.path, action], result = evaluate(b.m, b.ps);
            if (accept(b, path, node.sample, result)) next.push({ b, path, sample: node.sample, score: value(result) });
            else dispose(b);
          }
          yield;
        }
      }
      for (const node of frontier) dispose(node.b);
      const keys = new Set(), keep = [];
      for (const node of next.sort((a,b) => b.score - a.score)) {
        const key = `${actionKey(node.path[0])}|${node.sample}`;
        if (!keys.has(key) || keep.length < width * samples) { keep.push(node); keys.add(key); } else dispose(node.b);
      }
      frontier = keep;
    }
    const choices = [...groups].filter(([, g]) => g.every(Boolean)).map(([first, g]) => ({ first,
      score: aggregate(g.map(x => x.score)), sampleScores: g.map(x => x.score), paths: g.map(x => x.path) }));
    choices.sort((a,b) => b.score - a.score || (a.first === 'stop::' ? -1 : b.first === 'stop::' ? 1 : a.first.localeCompare(b.first)));
    const best = choices[0], baseline = choices.find(x => x.first === 'stop::');
    const action = best && baseline && best.score > baseline.score + .5 ? best.paths[0][0] : { type: 'stop' };
    return { signature, action, score: best?.score, baselineScore: baseline?.score, choices, nodes, candidates: records, rejected, cancelled: false };
  } finally { for (const b of branches) b.dispose(); }
}

/** Recheck state and execute only the observed first action; refresh results are never replayed from a branch. */
export function commitPrepChoice(m, ps, choice) {
  if (!choice || choice.cancelled || prepSignature(m, ps) !== choice.signature) return { error: 'STALE_PLAN' };
  return applyPrepAction(m, ps, choice.action);
}
