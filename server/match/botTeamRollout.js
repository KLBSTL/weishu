// Offline central teacher at pure-AI PREP boundaries. Not imported by the production bot.
import { PHASE } from '../../shared/constants.js';
import { chargeableLeak } from '../../shared/ultimateBalance.js';
import { deriveSeed } from '../sim/rng.js';
import { forkPrep, applyPrepAction } from './botEnvironment.js';
import {basePositionClass} from './board.js';

const rngKeys = ['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'];
const encode = (_,v) => v instanceof Map ? [...v] : v instanceof Set ? [...v] : v;

/** For isolation/replay assertions only; raw RNG/private state must not be actor input or exported as observations. */
export function teamBoundarySignature(m, { runtime = false } = {}) {
  const keys = ['playerId','alive','lp','funds','pendingFunds','bandId','shop','hand','temp','board','layers','bonds',
    'counters','round','stats','effects','bounties','offers','recruitment','bondCountBonus','prepsEnded','lastResult','diyStock'];
  return JSON.stringify({ phase:m.phase, round:m.round, seed:m.seed, uid:m.uidSeq, pool:m.pool.entries, wave:m.wave,
    last:m.lastResults, players:m.order.map(p => Object.fromEntries(keys.map(k => [k,p[k]]))),
    rng:rngKeys.map(k => m[k].state()), ...(runtime ? {clock:m.sched.now(), timers:m.sched.pending?.()} : {}) }, encode);
}

export function teamRolloutSnapshot(m) {
  return { round:m.round, phase:m.phase, alive:m.alivePlayers().length,
    lp:m.alivePlayers().reduce((n,p) => n + Math.max(0,p.lp),0),
    players:Object.fromEntries(m.order.map(p => [p.playerId,{alive:p.alive,lp:Math.max(0,p.lp),funds:p.funds,
      pendingFunds:p.pendingFunds,level:p.shop.level,units:p.deployCount,activeLayers:p.activatedLayers(),
      layers:{...p.layers},prepsEnded:p.prepsEnded}])) };
}

/**
 * Restore at a normal PREP entry, before any AI policy runs. Teammate state is central-teacher state, never actor input.
 * Unknown future shops/waves/battles get a fresh sampled stream. Only a sampled team boundary may copy its own RNG.
 */
export function forkTeamPrep(source, playerId, { seed = deriveSeed(source.seed,`team-rollout:${source.round}`),
  continuation = false, policy = 'off', rehearsal = source.botRehearsal,details=false,endgame=false } = {}) {
  // Only the separate offline endgame wrapper opts into a boss PREP start. The original normal interface is unchanged.
  if (source.phase !== PHASE.PREP || (!endgame && source.round >= source.gd.bossRound) || source.ended || source.disposed) throw new Error('NORMAL_PREP_REQUIRED');
  if (source.order.some(p => !p.isBot || p.autoplay)) throw new Error('TEAM_AI_ONLY');
  if (source.alivePlayers().some(p => p.ready) || source._prepEndQueued) throw new Error('PREP_ENTRY_REQUIRED');
  if (continuation && !source._teamRolloutBranch) throw new Error('OFFICIAL_FUTURE_FORBIDDEN');
  if (policy !== 'off' || !Number.isInteger(rehearsal) || rehearsal < 0 || rehearsal > 8) throw new Error('BAD_ROLLOUT_POLICY');
  const actor = source.players.get(playerId);
  if (!actor) throw new Error('UNKNOWN_ACTOR');
  const active = actor.alive ? actor : source.alivePlayers()[0];
  const branch = forkPrep(source,active,{seed,continuation}), m = branch.m;
  m.lastResults = structuredClone(source.lastResults);
  m.seed = continuation ? source.seed : (Number(seed) >>> 0) || 1;
  m.opts.seed = m.seed; m.battlePrefix = `${m.seed.toString(36)}-rollout`;
  m.clientCombat = false; m.verifyMode = 'off'; m.botSliceMs = Infinity; m.headlessSliceMs = Infinity;
  m.botPlanner = policy; m.botRehearsal = rehearsal; m._teamRolloutBranch = true;
  m._teamRolloutDetails=details||!!source._teamRolloutDetails;
  m._prepEndQueued = false; m.deadline = 0;
  m._teamRolloutRounds = continuation ? structuredClone(source._teamRolloutRounds || []) : [];
  m._teamRolloutNormal = continuation ? structuredClone(source._teamRolloutNormal || {}) : {};
  m._teamRolloutLayers = continuation ? structuredClone(source._teamRolloutLayers || {}) : {};
  const rows = m._teamRolloutRounds;

  const dispatch = m.dispatch.bind(m);
  m.dispatch = (ps,hook,ev,...rest) => {
    if (hook === 'onLayers' && ps && ev?.to > ev?.from) {
      const gains = (m._teamRolloutLayers[m.round] ||= {})[ps.playerId] ||= {};
      gains[ev.bondId] = (gains[ev.bondId] || 0) + ev.to - ev.from;
    }
    return dispatch(ps,hook,ev,...rest);
  };
  const finishCombat = m._finishCombat.bind(m);
  m._finishCombat = resultOf => finishCombat(f => {
    const result = resultOf(f);
    if (result?.synthetic) m.reportError('team rollout','synthetic normal battle');
    const normal = m._teamRolloutNormal[m.round] ||= {};
    for (const [pid,pp] of Object.entries(result?.perPlayer || {})) {
      const uids = new Set([...m.players.get(pid).board.values()].filter(p => p.kind === 'chess').map(p => p.uid));
      const ops = (pp.unitsEnd || []).filter(u => uids.has(u.uid));
      normal[pid] = { payable:(pp.leaked || []).filter(chargeableLeak).length,
        leaked:(pp.leaked || []).filter(l => l?.counted !== false).length, killed:pp.killed || 0,damage:pp.damageDealt || 0,
        healing:pp.healingDone || 0,operators:ops.length,standing:ops.filter(u => u.alive).length,
        hp:ops.reduce((n,u) => n + (u.alive ? u.hpPct || 0 : 0),0) };
      if(m._teamRolloutDetails) {
        const player=m.players.get(pid),gd=player.gd||m.gd,stats=new Map((pp.unitStats||[]).map(u=>[u.uid,u]));
        normal[pid].units=ops.map(u=>{
          const c=gd.chess(u.defId),s=stats.get(u.uid)||{},heal=c?.dmgType==='heal'||c?.attackKind==='heal';
          return {uid:u.uid,id:u.defId,alive:u.alive,hp:u.hpPct,healer:heal,blocker:!!c&&basePositionClass(c)==='melee'&&(c.stats?.blockCnt??1)>0,
            antiAir:!!c?.canHitFly&&!heal,damage:s.dmg||0,healing:s.heal||0,taken:s.taken||0,attacks:s.attacks||0};
        });
      }
    }
    return result;
  });
  const settle = m.settle.bind(m);
  m.settle = (plan,result) => {
    if (result?.synthetic) m.reportError('team rollout','synthetic unite battle');
    const round = m.round, before = teamRolloutSnapshot(m), lpLost = new Map(m.order.map(p => [p.playerId,p.stats.lpLost]));
    const helpers = plan?.helpers.map(p => p.playerId) || [];
    settle(plan,result);
    const after = teamRolloutSnapshot(m), normal = m._teamRolloutNormal[round] || {};
    rows.push({round,before,after,unite:!!plan && !!result && !result.synthetic,helpers,
      layers:structuredClone(m._teamRolloutLayers[round] || {}),
      players:Object.fromEntries(m.order.map(p => {
        const charged = Math.max(0,p.stats.lpLost-(lpLost.get(p.playerId)||0)), n = normal[p.playerId] || null;
        return [p.playerId,{normal:n,charged,rescuedLp:plan && result && n ? Math.max(0,Math.min(m.gd.lpCapPerRound,n.payable)-charged) : 0,
          eliminated:before.players[p.playerId].alive && !p.alive}];
      })) });
  };
  const enterPrep = m.enterPrep.bind(m);
  m.enterPrep = () => {
    enterPrep();
    const last = rows.at(-1);
    if (last && last.round + 1 === m.round) last.nextPrep = teamRolloutSnapshot(m);
  };
  let scheduled = false, closed = false;
  const errors = () => m.errorCount + m.simErrors + m.dispatcher.errors + m.sched.errors.length;
  const env = { m, actor:m.players.get(playerId), seed:m.seed, rows,
    apply(action) {
      if (scheduled || closed) return {error:'ROLLOUT_ALREADY_STARTED'};
      return applyPrepAction(m,m.players.get(playerId),action);
    },
    advance(rounds = 1, {maxSteps = 100000,cancelled = () => false} = {}) {
      if (closed) throw new Error('ROLLOUT_CLOSED');
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 3 || !Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('BAD_ROLLOUT_BUDGET');
      if (m.phase !== PHASE.PREP || m.round >= m.gd.bossRound) throw new Error('NORMAL_PREP_REQUIRED');
      const start = m.round, target = Math.min(m.gd.bossRound,start+rounds), from = rows.length;
      if (!scheduled) {
        m.setDeadline(m.soloUntimed ? null : m.gd.prepTime(m.round),() => m.prepDeadline());
        let i=0; for (const ps of m.alivePlayers()) m.scheduleBotPrep(ps,i++);
        scheduled = true;
      }
      let steps=0, wasCancelled=false;
      while (!m.ended && !(m.phase === PHASE.PREP && m.round >= target) && !errors() && steps < maxSteps) {
        if (cancelled()) { wasCancelled=true; break; }
        if (!m.sched.runNext()) break; steps++;
      }
      const complete = m.ended || (m.phase === PHASE.PREP && m.round >= target);
      const status = errors() ? 'error' : wasCancelled ? 'cancelled' : !complete ? 'budget' : m.ended ? 'defeat'
        : target === m.gd.bossRound ? 'boss-boundary' : 'horizon';
      return {status,complete:complete && !errors() && status !== 'cancelled',startRound:start,endRound:m.round,
        completedRounds:rows.length-from,steps,errors:errors(),rounds:structuredClone(rows.slice(from)),team:teamRolloutSnapshot(m)};
    },
    dispose() { if (!closed) { closed=true; m.dispose(); branch.dispose(); } },
  };
  return env;
}

/** Central finite-horizon outcome; not a probability or a trained policy value. */
export function compareTeamOutcomes(a,b) {
  if (!a.complete || !b.complete || a.errors || b.errors) throw new Error('INCOMPLETE_TEAM_OUTCOME');
  return a.team.alive-b.team.alive || a.team.lp-b.team.lp || (a.endRound || 0)-(b.endRound || 0);
}
