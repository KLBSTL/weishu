// server/match/bot.js — AI player (DESIGN §6.6). Used for AI teammates and "AI 托管" (g.autoplay; a departed human
// is eliminated, Match._quit). Every action goes through the same validated
// PlayerState handlers a human uses; randomness only from the match's bot rng (deterministic per seed).
//
// It reads only what a player can see: its own state, the shop, the shared pool's copies left, the teammates' bond
// strips, and the round's enemy preview (composition and routes, research 06 §4.3 "查看当前回合即将迎击的敌方单位").
//
// Prep routine (botPrep):
//   1. take a pending reward offer (merge progress, bond synergy, tier)
//   2. economy. The bond plan (bondPlan): a focus core bond — owned members, members the shop can still bring at this
//      level, banked layers, last round's focus (commit instead of flip-flopping), minus a teammate's main core bond
//      (its bond strip; the shop pool is shared) — and a second bond (most owned members, next threshold within
//      reach). Keepers: the deployed operators, focus / second members, chess of tier ≥ shop level − 1. Sell bench
//      chess that neither make the lineup nor build toward something (a pair whose third copy can still come, a
//      keeper, an elite; ≤ BENCH_BUDGET spare units, pairs first), buy toward a full board (the deploy cap is 8 from
//      round 1), complete every merge it can afford — before a level-up can spend the funds —, level the 调度中心 on a
//      curve (free levels always; the −1/round discount is waited for early), then spend the rest (leftover funds are
//      lost at prep end; a band that keeps them, 坎诺特, holds its interest capital back — fundsReserve): with a full
//      board a purchase must be merge progress or a lineup upgrade AND worth more than the refreshes its price would
//      pay for — refreshValue: Σ over the held pairs of P(a refresh shows the third copy, the shop's copy-weighted odds
//      over the shared pool) × MERGE_HIT (an elite plus the merge's free pick of the next tier) — else it refreshes. A
//      third copy it cannot afford freezes the shop for the next round (maybeFreeze). Purchase scores: merge progress >
//      bond thresholds (focus, second) > role needs (blockers, anti-air when the wave flies, one or two healers) >
//      tier and armour fit (the share of a dealer's damage the round's DEF / RES lets through, effDps; an attack on every
//      enemy in range — 阵法术师 / 轰击术师 — counts double, splash and chain a little, CROWD). A merge that
//      consumes a deployed copy leaves the elite on that copy's tile (PRTS 卫戍协议/帮助, PlayerState._mergeChess):
//      nothing here assumes it in the hand — steps 3–4 plan it like any owned unit (kept, moved or benched).
//   3. lineup: the deployed set maximizes unit value (tier, elite, items, armour fit) + activated bond tiers (exact
//      counting via computeBonds; every deployed focus member counts toward the next threshold) + composition
//      (chooseLineup: greedy seed + swap hill-climbing).
//   4. placement (planLayout): the round's routes are traced over the own board from the enemy preview (ground
//      routes on the stage's device-aware ground paths, flying routes through their checkpoints; 近地悬浮 enemies walk
//      the ground path but count as flyers) and weighted by their enemies; an exposure model (tile time × DPS of the
//      covering units against the round's DEF / RES, blocker hold time, flyers only for anti-air) is maximized
//      greedily — blockers first, then damage dealers by DPS, then healers — over every
//      (legal tile, direction) pair of the server's deploy map (no 深水区). A MELEE operator is planned on the ground
//      tiles, where it blocks — except one whose trait reads 「可以放置于远程位」 (歌蕾蒂娅, 崖心, 见行者, any module:
//      placeClass 'all', shared/highGround.js), which takes a 高台 whose range covers the enemy road, else the ground
//      (owner 2026-10-04 for the 高台 preference, 2026-10-05 for who may use one). It stays a blocker in the lineup
//      (basePositionClass). A blocker whose range grid is its own tile only (range 0-1: 角峰, 古米, 泡泡, 折桠, 菲莱, 蛇屠箱,
//      塞雷娅, 余) is planned on a free tile of the enemy road first: off it nothing is blocked or hit. Each unit's range grid — the one it is
//      deployed with, rangeRec (loadoutRecord attackRangeGrid) — is rotated per direction (DESIGN §3; RIGHT is tried first
//      and kept on ties, so symmetric ranges and melee units whose front adds nothing stay facing the gates), so
//      ranged units turn toward the enemy path tiles they cover best and blockers toward the road; on 气流 tiles
//      (act2 m01 blowers) the DPS is scaled by the blower ATK bonus of that direction (with / against / across). The last
//      arrangement of a prep REHEARSES up to m.botRehearsal distinct layout variants with the real Battle (rehearsal
//      seed, no meta dispatch, board restored exactly) and keeps the one with the fewest leaks. The default plan is
//      placed first; Match steps the rehearsal in wall-clock-bounded slices (botPrepBegin → job.run → botPrepEnd) so
//      whole simulated battles never block the server's event loop. The prep routine itself is sliced the same way:
//      botPrepBeginSteps / botPrepEndSteps (and planLayoutSteps, arrangeSteps, createRehearsalSteps) are step
//      generators that yield between whole actions (never with a transient board) — the same actions in the same
//      order as the one-shot functions (runSteps), hence the same rng draws and decisions.
//      The summon cards of the placed operators (赫默's 医疗探机, 伺夜's 狼群 …; user playtest #6) are placed after
//      them on the best remaining tiles — a tactician's 援军 (狼群 / 流形) only on a tile of its owner's attack range
//      (its tactical point: PlayerState.summonRange, the server's legality; player report #9 after 0.1.0) —, 凯瑟琳's
//      支援装置 next to the best operator no device faces yet, facing it. Legality is the server's: the bot plans on the deploy map (board.js legalTiles) and
//      a tile g.move refuses is skipped for the next best one.
//   5. items by what they do (itemTarget): equipment on the strongest deployed damage dealers (survival items on
//      blockers, bond signature items on a member), 信标 on a bench single, 拟态物质 on a pair, 博士投影 (both
//      qualities) on the strongest normal operator, 突变细胞 on the least valuable normal single below 6阶 (cellTarget:
//      never an elite or a pair member; the operator its transformation gains joins the bench — the buy loop's bench
//      shed leaves a piece gained since the last prep alone, rememberOwned — and steps 3–4 of the next prep deploy it
//      like any owned unit), bond items on a focus member; Arts (useArt): 画卷 copies the most valuable
//      deployed operator, 教鞭 / “神秘顾客” are used after a perfect battle and kept otherwise (consume-on-equip items /
//      Arts only with a handler)
//   6. resolve the temp slots (a 突变细胞 left there — it comes back after every transformation — gets a hand slot made
//      for it, makeHandRoom, instead of being destroyed), keep one hand slot free (freeHandSlot: a kept bounty Art goes
//      before a chess on a bot's own seat, never on a human's seat under AI 托管), then Ready.
// Strategy (botPickBand): weighted by starting LP among the offered bands; never one whose mechanic rides on a bond the
// mode switches off (gd.bandBondIds = bands.json bondIds: the bond its text names in <…> or its blackboards name — 标准's
// 潘格尼尼, 克莱门莎, 玛恩纳; DESIGN §21.26); alone, 老鲤's withheld first-round funds only rarely (× 0.02).
// 机变 (botPickCard): a bounty by its expected payout minus the expected LP lost — bountyKillChance runs the exposure
// model for that one enemy against the own board; a card the board is unlikely to beat wins only when nothing better
// is offered or it pays much more —; tactic cards by what they act on (a 盟誓 / 驰援 card on the own bonds, 升华 …);
// items by tier and use.
// Placement quality (tools/matchrun sweeps, research-faithful waves): the planner beats random layouts by ≈ 8 points
// of kill rate and rehearsal adds ≈ 5 more; see docs/META.md §1.5. Old vs new decisions on the same seeds:
// tools/botbench.mjs.

import { GEO } from '../../shared/constants.js';
import { deriveSeed, createRng } from '../sim/rng.js';
import { ASPD_MIN } from '../sim/constants.js';
import { freeSlot, countFree, legalTiles, canPlace, positionClass, placeClass, basePositionClass, parseKey, tileKey, FIELD, pieceDir, boardTileOf, BOSS_MIRROR_COL } from './board.js';
import { rotateOffset, normDir, mirrorDir, oppositeDir } from '../sim/dir.js';
import { itemKey } from './gamedata.js';
import { computeBonds, pieceBonds } from './bondsMeta.js';
import { SharedBossPool, bossPoolHp } from './finalAssault.js';
import { customGrowthTrait, growthValue, growthReserve, growthPlanValue, refreshGrowthValue, bondStackValue, estimateCombat, equipmentGain, receivesBond, acquisitionGrowthValue } from './botStrategy.js';
import { withBounties, bountySpawns, isFlyKey } from './waves.js';
import { mitigate } from '../sim/damage.js';
import { HOVER_KEYS } from '../sim/content/enemies.js';
import { attackRangeGrid, loadoutRecord, resolveRecordLoadout } from '../../shared/loadoutRecord.js';
import { selectSubBonds, routeAffinity, engineProfile, growthBenchBudget, bandRefreshUtility, planOwnedBonds } from './botPlans.js';
import { previewPrep, previewBattleGrowth } from './botGrowth.js';
import { chargeableLeak } from '../../shared/ultimateBalance.js';
import { searchPrepSteps, commitPrepChoice } from './botSearch.js';
import { forkPrep, applyPrepAction, prepObservation, prepSignature,legalPrepActions } from './botEnvironment.js';
import { prepValue, prepRuleHash } from './botValueModel.js';
import {teamRankFeatures,teamRankScore,teamEligible} from './botTeamModel.js';
import {SAFE_TEAM_KIND,safeFeaturesFromLegacy,selectSafeTeamCandidate} from './botTeamGuardModel.js';
import {CONTEXT_TEAM_KIND,contextTeamCandidates,contextTeamFeatures,selectContextTeamCandidate,publicArmySummary,contextPublicTeammates} from './botTeamContextModel.js';

/**
 * Drive a step generator (planLayoutSteps, createRehearsalSteps, arrangeSteps, botPrepBeginSteps …) to its end in one
 * go and return its value — the synchronous form every step generator also has (tools, tests, botPrep).
 */
export function runSteps(gen) {
  let r;
  do {
    r = gen.next();
    if (!r.done && r.value?.rehearsal) r.value.rehearsal.run();
  } while (!r.done);
  return r.value;
}

/** Lineup value of each deployed member of the focus bond (up to its top threshold). */
const FOCUS_MEMBER = 4;
/** Value per unit of armour fit (the share of a dealer's damage the round's DEF / RES lets through, armorFit). */
const ARMOR_WEIGHT = 10;
/** Least buy score of a purchase once the board is full (below it the bot refreshes instead). */
const BUY_FULL_MIN = 8;
/**
 * Value of completing an elite (+25 % stats, skill level 7, and the merge's free pick of three tier min(level + 1, 6)
 * chess — worth having for any pair, a cheap one included) and of making a keeper's pair; refreshValue weighs them by
 * the shop odds.
 */
const MERGE_HIT = 36;
const PAIR_HIT = 8;
/** Pairs the bench holds at once while refreshes hunt their third copies (each takes a hand slot or two). */
const MAX_PAIRS = 4;
/** Refreshes per prep at most (funds bound them first). */
const MAX_REFRESHES = 16;
/** Spare bench units kept beyond the lineup at the prep start (pairs first). */
const BENCH_BUDGET = 6;
/** Shop level the bot aims for at the start of round r (index = round). */
const LEVEL_TARGET = [1, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6];
/**
 * AI 托管 of a human with 自选 picks (0.2.0; bots field none): the buy score of one of the player's own slotted pieces —
 * the operator the player chose to field (follow-up #13: under AI 托管 they were rarely bought) — and the 调度中心 is
 * levelled one round earlier for the step that opens a slotted tier (levelUp).
 */
export const DIY_PIECE_BONUS = 12;
const TIER_POWER = [0, 10, 12.5, 15, 18, 21.5, 25];
/** Prep-side 特质 that keep adding bond layers every round / every refresh (a player's main layer engine). */
const RECURRING_TRAIT_EVENTS = new Set(['SERVER_PREP_START', 'SERVER_PREP_FIN', 'SERVER_REFRESH_SHOP']);
const LAYER_TRAIT_RE = /BOND|LAYER/;
const ECON_TRAIT_RE = /GOLD|REFRESH|COIN/;
const DEFAULT_MELEE_RANGE = [[0, 0], [0, 1]];

/**
 * Band pick among the strategies the mode offers (gd.bandIds): weighted by starting LP (sturdier strategies are
 * preferred). Alone, a band that withholds the first rounds' funds (老鲤 "资金暂存": no operator in R1–R2, every enemy
 * leaks) is avoided — only 联防 teammates cover that. A band whose mechanic rides on a bond the mode switches off
 * (gd.bandBondIds ∩ gd.modeInactiveBonds — 标准: 潘格尼尼 <拉特兰>, 克莱门莎 <阿戈尔>, 玛恩纳 <卡西米尔>) weighs 0, never taken
 * (DESIGN §21.26); with every band excluded, the default band. One rng draw per call (deterministic per seed); modes
 * without inactive bonds keep exactly the earlier picks.
 */
export function botPickBand(m, ps) {
  const gd = ps?.gd || m.gd;
  const ids = gd.bandIds().filter(id => !m.bandTaken?.(id, ps?.playerId));
  if (!ids.length) return gd.defaultBandId;
  const lateFunds = (id) => /暂存/.test(String(gd.band(id)?.desc || ''));
  const offBond = (id) => gd.bandBondIds(id).some((b) => gd.modeInactiveBonds.has(b)) || m.recruitmentBandOff?.(id);
  const supply = new Map();
  if (m.pool?.entries) for (const [id, e] of m.pool.entries) {
    if (!(e.left > 0)) continue;
    for (const b of gd.chess(id)?.bonds || []) {
      if (!supply.has(b)) supply.set(b, new Set());
      supply.get(b).add(gd.baseIdOf(id));
    }
  }
  const viable = id => {
    const cores = gd.bandBondIds(id).filter(b => gd.bond(b)?.isCore);
    return !m.pool?.entries || !cores.length || cores.some(b => (supply.get(b)?.size || 0) >= (gd.bond(b).thresholds?.[0] || 3));
  };
  const specialty = ids.filter(id => !offBond(id) && viable(id) && gd.bandBondIds(id).some(b => gd.bond(b)?.isCore));
  const fallback = ids.filter(viable);
  const choices = specialty.length ? specialty : fallback.length ? fallback : ids;
  const pairs = choices.map((id) => [id, offBond(id) ? 0 : Math.max(1, (gd.startLp(id) - 18) ** 2) * (m.isSolo && lateFunds(id) ? 0.02 : 1)]);
  let total = 0;
  for (const [, w] of pairs) total += w;
  let r = m.rngBots() * total;
  if (!(total > 0)) return gd.defaultBandId;
  let last = null;
  for (const [id, w] of pairs) {
    if (!(w > 0)) continue;
    last = id;
    r -= w;
    if (r < 0) return id;
  }
  return last;
}

/**
 * 机变 card pick among the untaken indexes (a draft is one family: generateDraft). Bounties (extra enemies in the own
 * next battles) score their expected payout minus the expected LP lost (bountyScore: the enemy against the own board —
 * an expected-value comparison, so a card the board is unlikely to beat is taken only when no better one is offered or
 * its pay outweighs the expected leaks); items by tier and use (an item the bot cannot use is worth little); tactic
 * cards by what they act on (tacticScore: a 盟誓 / 驰援 card on the own bonds, 升华 …). Across families items and team
 * buffs come before bounties.
 */
export function botPickCard(m, ps, cards, available) {
  let best = available[0];
  let bestScore = -Infinity;
  for (const i of available) {
    const c = cards[i];
    if (!c) continue;
    let s = 0;
    if (c.kind === 'item') s = 8 + (c.tier || 1) * 4 + (canUseItem(m, ps, { id: c.id }) ? 0 : -8);
    else if (c.kind === 'bounty') s = bountyScore(m, ps, c);
    else if (c.kind === 'tactic') s = tacticScore(m, ps, c);
    s += m.rngBots() * 0.5;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

/**
 * Chance that the own board as it stands (the 机变 draft comes before the prep) kills one enemy of a bounty card: the
 * planner's exposure model (Layout) for that single enemy — its HP × the round's multiplier against Σ over the tiles of
 * its route (the busiest route of its kind: flyers the flying routes, else the ground ones) of the time it spends there
 * × the DPS of every deployed unit covering the tile against its DEF / RES (dpsVs; flyers anti-air only), plus the
 * first blocker's hold on the ground. 0.5 without data.
 */
export function bountyKillChance(m, ps, card) {
  const gd = ps?.gd || m.gd;
  const e = card && gd.enemy(card.enemyKey);
  if (!e || !e.stats) return 0.5;
  const model = fieldModel(m, ps);
  const sc = gd.enemyScale(m.round);
  const hp = Math.max(1, (e.stats.maxHp || 1000) * sc.hpMul);
  const def = e.stats.def || 0;
  const res = e.stats.res || 0;
  const fly = isFlyKey(gd, card.enemyKey) || HOVER.has(card.enemyKey);
  const same = model.routes.filter((r) => !!r.fly === fly);
  const pool = same.length ? same : model.routes;
  if (!pool.length) return 0.5;
  const route = pool.reduce((a, b) => (b.n > a.n ? b : a));
  const speed = Math.max(0.05, (e.stats.moveSpeed || 1) * sc.speedMul);
  const tileTime = Math.max(0.4, Math.min(6, 1 / (speed * 0.5)));
  const units = [];
  for (const [k, p] of ps.board) {
    const rec = p.kind === 'token' ? gd.token(p.id) : rangeRec(ps, gd.chess(p.id));
    if (!rec) continue;
    const [r, c] = parseKey(k);
    const u = unitOf(rec, k, r, c, pieceDir(p), model);
    u.vs = dpsVs(rec, def, res) * u.atkMul;
    units.push(u);
  }
  let exp = 0;
  let held = false;
  for (const k of route.tiles) {
    let t = tileTime;
    if (!fly && !held && units.some((u) => u.block > 0 && u.key === k)) { t += LAYOUT_PARAMS.hold; held = true; }
    let dps = 0;
    for (const u of units) if (u.cover.has(k) && (fly ? u.air : u.ground)) dps += u.vs;
    exp += t * dps;
  }
  return 1 - Math.exp(-exp / (BOUNTY_KILL * hp));
}

/** Exposure (× HP) a bounty enemy needs for a 63 % kill chance (conservative: it fights beside the wave). */
const BOUNTY_KILL = 2;

/**
 * Expected value of a bounty card: per battle it lasts, P(kill) × coin (kill payout) or P(kill)^n × coin (perfect
 * payout) minus the expected leaks × the value of an LP (2 + 20 / LP: dearer when low).
 */
function bountyScore(m, ps, card) {
  const p = bountyKillChance(m, ps, card);
  const n = Math.max(1, card.count || 1);
  const battles = Math.max(1, Math.min(3, card.rounds || 1));
  const lpCost = 2 + 20 / Math.max(1, ps.lp);
  const coin = Math.max(0, card.coin || 0);
  const gain = card.payout === 'perfect' ? p ** n * coin : p * n * coin;
  return battles * (gain - (1 - p) * n * lpCost);
}

/** 机变 tactic card value by its effect (data/effects.json buffs), team cards a little more (teammates get it too). */
function tacticScore(m, ps, card) {
  const eff = m.gd.effect(card.id);
  const buffs = eff && Array.isArray(eff.buffs) ? eff.buffs.filter(Boolean) : [];
  const owned = ownedBonds(m, ps);
  const plan = bondPlan(m, ps, owned);
  const rel = (b) => (b === plan.focus ? 1 : b === plan.second ? 0.7 : (ps.bonds[b] && ps.bonds[b].active) ? 0.5 : owned.counts.get(b) ? 0.25 : 0.05);
  let s = 8;
  for (const b of buffs) {
    const bb = b.bb || {};
    const bs = b.bbStr || {};
    const count = Number.isFinite(bb.count) ? bb.count : 1;
    switch (b.key) {
      case 'global_special_choice_bond_addlayer': {
        let r = 0;
        for (const id of String(bs.bond_list || '').split(',').map((x) => x.trim()).filter(Boolean)) r = Math.max(r, rel(id));
        s = 4 + r * count * 1.2;
        break;
      }
      case 'single_special_choice_gain_bond_chess': s = 5 + rel(bs.bond) * 10; break;
      case 'single_special_choice_gloden_char_chess': s = 16; break;
      case 'single_special_choice_gloden_equip_chess': s = 9; break;
      case 'global_special_choice_gain_equip': s = 10; break;
      case 'global_special_choice_refresh_free': s = 7 + count * 0.5; break;
      case 'global_special_choice_gain_coin': s = 4 + count; break;
      // 锐利 needs an empty hand at the prep end — the bot keeps a bench
      case 'global_special_choice_prep_finish_bench_at_most': s = 3; break;
      default: break;
    }
  }
  return s + (card.team ? 3 : 0);
}

// ---------------------------------------------------------------------------------------------------
// evaluation helpers

// a player's record of a chess id (its data view: a human's slotted 自选 slots are its operators, 0.2.0 player/diy.js)
const chessRec = (m, id, ps = null) => (ps?.gd || m.gd).chess(id);
const isHealer = (c) => !!c && (c.dmgType === 'heal' || c.attackKind === 'heal');
// the record's own position: a 钩索师 / 推击手 is a MELEE blocker like any other (a 高台 does not block)
const isBlocker = (c) => !!c && basePositionClass(c) === 'melee' && (c.stats?.blockCnt ?? 1) > 0 && c.attackKind !== 'none';
/** 近地悬浮 enemies walk a ground route but are air units (no block, anti-air only — DESIGN §19). */
const HOVER = new Set(HOVER_KEYS);
const hitsFly = (c) => !!c && !!c.canHitFly && !isHealer(c) && c.attackKind !== 'none';

/** Distinct owned members per bond (board + hand + temp), and per-bond member sets. */
function ownedBonds(m, ps, exclude = null) {
  return planOwnedBonds(ps.gd || m.gd, ps, exclude);
}

/**
 * Per bond, from one pass over the shared pool: `reach` = distinct unowned members of tier ≤ shop level + 1 with copies
 * left (what the shop can still bring soon — a teammate draining a bond, or a bond of high-tier members only, makes it
 * a poor target), `supply` = the copies left of all its members.
 */
function bondPoolStats(m, ps, owned) {
  const reach = new Map();
  const supply = new Map();
  const future = new Map();
  const maxTier = Math.min(6, ps.shop.level + 1);
  for (const [id, e] of m.pool.entries) {
    if (!(e.left > 0)) continue;
    const c = m.gd.chess(id);
    if (!c || !Array.isArray(c.bonds)) continue;
    const reachable = c.tier <= maxTier && !owned.bases.has(m.gd.baseIdOf(id));
    for (const b of c.bonds) {
      supply.set(b, (supply.get(b) || 0) + e.left);
      if (reachable) reach.set(b, (reach.get(b) || 0) + 1);
      if (!owned.bases.has(m.gd.baseIdOf(id))) future.set(b, (future.get(b) || 0) + 1);
    }
  }
  return { reach, supply, future };
}

/**
 * A teammate's main core bond as every player sees it (its public bond strip, ps.bonds): the core bond with the most
 * counted members, ≥ 2 (ties: data order); null when it builds none yet. Humans and bots alike.
 */
function mainCoreBond(m, p) {
  let top = null;
  let topN = 1;
  for (const id of m.gd.bondIds) {
    const b = p.bonds && p.bonds[id];
    const n = b ? b.count || 0 : 0;
    if (n > topN && m.gd.bond(id)?.isCore) { topN = n; top = id; }
  }
  return top;
}

/**
 * The bonds the bot builds around (cached per round and owned set): `focus` = the core bond with the best
 * owned members × 10 + reachable members (bondPoolStats, ≤ 4) + layers already banked (≤ 6) + 6 for last round's focus
 * (commit instead of flip-flopping between equal bonds) − 6 when a teammate already builds it (its main core bond on
 * its public bond strip, mainCoreBond — the shop pool is shared); `second` = the other live bond (core or add-on) with
 * the most owned members whose next threshold is within reach (≥ 1 owned member). `ps._botFocusId` keeps the focus
 * across rounds.
 */
export function bondPlan(m, ps, owned = ownedBonds(m, ps)) {
  const key = `${m.round}|${ps.bandId}|${ps.shop.level}|${ps.funds}|${JSON.stringify(ps.layers)}|${[...ps.board].map(([k,p]) => `${k}:${p.uid}:${p.dir}:${p.items?.map(i=>i.id)}`).join()}|${ps.allChess().map(p=>`${p.uid}:${p.id}:${p.items?.map(i=>i.id)}`).join()}|${[...m.pool.entries].map(([id,e])=>`${id}:${e.left}`).join()}`;
  if (ps._botFocus && ps._botFocus.key === key) return ps._botFocus;
  const prev = ps._botFocusId ?? null;
  const mates = new Set();
  for (const p of m.alivePlayers()) {
    if (p === ps) continue;
    const b = mainCoreBond(m, p);
    if (b) mates.add(b);
  }
  let focus = null;
  let bestS = 0;
  const pool = bondPoolStats(m, ps, owned);
  // Commit to the selected specialty before the first matching shop purchase. If the shared pool can no longer
  // complete even its first threshold, a different core remains a legitimate fallback.
  const anchors = new Set(m.gd.bandBondIds(ps.bandId).filter(id => {
    const b = m.gd.bond(id);
    return b?.isCore && !m.gd.modeInactiveBonds.has(id)
      && (owned.counts.get(id) || 0) + (pool.future.get(id) || 0) >= (b.thresholds?.[0] || 3);
  }));
  for (const id of m.gd.bondIds) {
    const b = m.gd.bond(id);
    if (!b || !b.isCore || m.gd.modeInactiveBonds.has(id)) continue;
    const k = owned.counts.get(id) || 0;
    if ((!k && !anchors.has(id)) || (anchors.size && !anchors.has(id))) continue;
    const future = { layers: ps.layers, bonds: { [id]: { active: Math.min(k, ps.deployCap) >= (b.thresholds?.[0] || 3), tier: ps.bonds[id]?.tier || 1 } } };
    const s = k * 10 + Math.min(4, pool.reach.get(id) || 0) + Math.min(24, bondStackValue(m.gd, future, id) * .6)
      + (id === prev ? 6 : 0) - (mates.has(id) ? 6 : 0) + Math.min(0.9, (pool.supply.get(id) || 0) / 100)
      + (m.gd.bandBondIds(ps.bandId).includes(id) ? 8 : 0);
    if (s > bestS) { bestS = s; focus = id; }
  }
  const { subBonds, routes } = selectSubBonds(m, ps, focus, owned, pool);
  const second = subBonds[0] || null;
  if (focus) ps._botFocusId = focus;
  ps._botFocus = { key, focus, second, subBonds, routes,
    reason: anchors.size ? 'specialty-reachable' : m.gd.bandBondIds(ps.bandId).length ? 'specialty-unreachable' : 'flexible' };
  return ps._botFocus;
}

/** Copies a merge takes (3; 风丸 2). */
const mergeNeed = (m, base) => m.gd.mergeCount(base) || 3;

/**
 * Bases worth merging ("keepers"): the deployed operators, the owned members of the focus / second bond, and owned
 * chess of a tier ≥ shop level − 1. A pair of anything else only clutters the bench and is sold later at a loss
 * (every sale returns 1).
 */
function keeperBases(m, ps, plan) {
  const out = new Set();
  for (const p of ps.board.values()) if (p.kind === 'chess') out.add(m.gd.baseIdOf(p.id));
  for (const p of ps.allChess()) {
    const c = chessRec(m, p.id, ps);
    if (!c) continue;
    const bonds = c.bonds || [];
    if ((plan.focus && bonds.includes(plan.focus)) || plan.subBonds?.some(id => bonds.includes(id)) || c.tier >= ps.shop.level - 1
      || growthValue(ps.gd || m.gd, ps, c, m.round, { acquisition: false, piece: p }) >= 4) out.add(m.gd.baseIdOf(p.id));
  }
  return out;
}

/** Role census of the owned chess. */
function roles(m, ps) {
  const r = { blockers: 0, antiAir: 0, healers: 0, total: 0 };
  for (const p of ps.allChess()) {
    const c = chessRec(m, p.id, ps);
    if (!c) continue;
    r.total++;
    if (isBlocker(c)) r.blockers++;
    if (hitsFly(c)) r.antiAir++;
    if (isHealer(c)) r.healers++;
  }
  return r;
}

/**
 * Bond value of adding chess `c` to what is owned (owned counts exclude it). `second`: the second bond (bondPlan);
 * once the focus has 3 owned members a member of another core bond is worth less unless it reaches a threshold (the
 * deploy cap holds about 6 members of one core bond + 2 others).
 */
function bondValue(m, c, owned, focus, second = null) {
  let v = 0;
  const committed = focus && (owned.counts.get(focus) || 0) >= 3;
  for (const b of (c && c.bonds) || []) {
    const bond = m.gd.bond(b);
    if (!bond || m.gd.modeInactiveBonds.has(b)) continue;
    const n = owned.counts.get(b) || 0;
    const th = Array.isArray(bond.thresholds) && bond.thresholds.length ? bond.thresholds : [bond.activeCount || 2];
    const w = bond.isCore ? 1.4 : 1;
    v += (2 + n * 2) * w;
    const hits = th.includes(n + 1);
    if (hits) v += 10 * w;
    else if (th.some((t) => t > n + 1 && t - (n + 1) <= 1)) v += 3 * w;
    if (bond.thresholdTemplate === 'count_threshold_downward') v -= n > 0 ? 12 : 0; // 独行 breaks with a second member
    if (b === focus) v += 10;
    else if (b === second) v += 4;
    else if (committed && bond.isCore && !hits) v -= 4;
  }
  return v;
}

/**
 * Power of a chess record. Base stats barely grow with the tier (research 03: T1 E1 Lv55 … T6 E2 Lv1); higher tiers
 * bring better skills and talents, elites (精锐) +25 % stats and skill level 7 — so the tier weight is modest and the
 * elite weight large.
 */
function power(c) {
  if (!c) return 0;
  const p = TIER_POWER[Math.max(1, Math.min(6, c.tier || 1))];
  return c.isGolden ? p * 1.9 : p;
}

/**
 * 特质 census of a chess (cached per match): recurring layer traits (every prep / refresh), one-shot layer traits
 * (获得时) and economy traits (funds / free refreshes). Humans build around the layer engines — so does the bot.
 */
function traitsOf(m, c) {
  const cache = m._botTraits || (m._botTraits = new Map());
  if (cache.has(c.chessId)) return cache.get(c.chessId);
  const t = { recurring: 0, gain: 0, econ: 0 };
  for (const gid of Array.isArray(c.garrisonIds) ? c.garrisonIds : []) {
    const g = m.gd.garrison(gid);
    if (!g || typeof g.effectKey !== 'string') continue;
    if (customGrowthTrait(g.effectKey)) continue; // parameter/activation-aware forecast below
    if (LAYER_TRAIT_RE.test(g.effectKey) && RECURRING_TRAIT_EVENTS.has(g.eventType)) t.recurring++;
    else if (LAYER_TRAIT_RE.test(g.effectKey) && g.eventType === 'SERVER_GAIN') t.gain++;
    else if (ECON_TRAIT_RE.test(g.effectKey) && g.eventType !== 'IN_BATTLE') t.econ++;
  }
  cache.set(c.chessId, t);
  return t;
}

/** Stand-alone value of an owned piece (no bond context): power, items, role fit, layer engines. */
function unitBase(m, piece, ctx) {
  const c = chessRec(m, piece.id, ctx.ps);
  if (!c) return 0;
  let v = power(c) + (piece.items ? piece.items.length * 5 : 0);
  if (c.diyFor) v += DIY_PIECE_BONUS;
  if (m.round <= 11) v += traitsOf(m, c).recurring * 4;
  if (ctx.growth !== false) v += growthValue(ctx.ps.gd || m.gd, ctx.ps, c, m.round, { acquisition: false, piece });
  v += routeAffinity(ctx.ps.gd || m.gd, ctx.ps, c, ctx, m.round);
  if (bossWaveOf(m, ctx.ps) && !isHealer(c)) {
    const dps = estimateCombat(ctx.ps.gd || m.gd, ctx.ps, c, piece, { boss: true, ...bossArmor(m, ctx.ps) }).dps;
    v += Math.min(20, 5 * Math.log2(1 + dps / 300));
  }
  if (c.attackKind === 'none' && !isHealer(c)) v -= 6;
  if (ctx.fly > 0 && hitsFly(c)) v += 2;
  if (ctx.model && !isHealer(c)) v += ARMOR_WEIGHT * (armorFit(ctx.model, c) - 0.6);
  return v;
}

/** Value of an owned piece for bench / sell decisions (its bonds counted against the other owned chess). */
function pieceValue(m, ps, piece, ctx) {
  const c = chessRec(m, piece.id, ps);
  if (!c) return 0;
  return unitBase(m, piece, ctx) + bondValue(m, c, ownedBonds(m, ps, piece.uid), ctx.focus, ctx.second) * 0.8;
}

/**
 * Score of a deployed set: unit values + the bonds it activates (exact tiers via bondsMeta.computeBonds, hand
 * members still count for BOARD_AND_DECK bonds) + composition (blockers, anti-air when the wave flies, ≤ 2 healers).
 */
function lineupScore(m, ps, set, ctx) {
  const cacheKey = set.map(p => `${p.uid}:${p.id}`).join('|');
  if (ctx.lineupScores?.has(cacheKey)) return ctx.lineupScores.get(cacheKey);
  const gd = ps?.gd || m.gd;
  const candidate = lineupView(m, ps, set), bonds = candidate.bonds;
  const candidateCtx = { ...ctx, ps: candidate, growth: false };
  let v = 0;
  for (const p of set) v += unitBase(m, p, candidateCtx);
  v += growthPlanValue(gd, candidate, set, m.round, p => chessRec(m, p.id, candidate));
  for (const [id, b] of Object.entries(bonds)) {
    // every deployed focus member counts on the way to the next threshold (a swap alone never reaches the 6-member tier)
    if (id === ctx.focus) {
      const bond = gd.bond(id);
      const top = bond && Array.isArray(bond.thresholds) && bond.thresholds.length ? bond.thresholds[bond.thresholds.length - 1] : 3;
      const specialty = gd.bandBondIds(ps.bandId).includes(id) ? 6 : 0;
      v += (FOCUS_MEMBER + specialty) * Math.min(b.count || 0, top);
    }
    if (!b.tier) continue;
    const bond = gd.bond(id);
    const w = bond && bond.isCore ? 14 : 9;
    v += b.tier * w + bondStackValue(gd, candidate, id) + (id === ctx.focus ? 6 : 0);
    if (ctx.subBonds?.includes(id)) v += 5;
  }
  let blockers = 0;
  let air = 0;
  let healers = 0;
  for (const p of set) { const c = chessRec(m, p.id, ps); if (isBlocker(c)) blockers++; if (hitsFly(c)) air++; if (isHealer(c)) healers++; }
  v -= Math.max(0, Math.min(2, ctx.roles.blockers) - blockers) * 15;
  if (ctx.fly > 0 && ctx.roles.antiAir > 0 && air === 0) v -= 12;
  v -= Math.max(0, healers - 2) * 10;
  if (m.round >= 3 && ctx.roles.healers > 0 && healers === 0) v -= 18;
  ctx.lineupScores?.set(cacheKey, v);
  return v;
}

/** Read-only activation frame shared by lineup scores and boss output/layout estimates. */
function lineupView(m, ps, set) {
  const gd = ps?.gd || m.gd;
  const board = new Map();
  set.forEach((p, i) => board.set([...ps.board].find(([, old]) => old.uid === p.uid)?.[0] || `x${i}`, p));
  const inSet = new Set(set.map((p) => p.uid));
  const hand = ps.hand.map((p) => (p && !inSet.has(p.uid) ? p : null));
  for (const p of ps.board.values()) if (p.kind === 'chess' && !inSet.has(p.uid)) {
    const slot = hand.indexOf(null); if (slot >= 0) hand[slot] = p;
  }
  const bonds = computeBonds(gd, { board, hand, layers: ps.layers, bondCountBonus: ps.bondCountBonus });
  return Object.assign(Object.create(ps), { board, hand, bonds });
}

/** Candidate-lineup score with fresh context, for focused diagnostics and regression tests. */
export function lineupScoreOf(m, ps, pieces) { return lineupScore(m, ps, pieces, context(m, ps)); }

/** Best deployable set of at most `cap` owned chess: greedy seed + swap hill-climbing on lineupScore. */
function chooseLineup(m, ps, ctx) {
  const all = ps.allChess();
  const cap = Math.min(ps.deployCap, all.length);
  const value = new Map(all.map((p) => [p.uid, pieceValue(m, ps, p, ctx)]));
  const seed = all.slice().sort((a, b) => value.get(b.uid) - value.get(a.uid) || a.uid - b.uid);
  let set = seed.slice(0, cap);
  let bench = seed.slice(cap);
  let score = lineupScore(m, ps, set, ctx);
  // identical pieces (same chess, same items — a bond can hang on an item pair) score alike: only the first is tried
  const sig = (p) => `${p.id}|${(p.items || []).map((it) => it.id).sort().join('+')}`;
  for (let iter = 0; iter < 12 && bench.length; iter++) {
    let best = null;
    const tried = new Set();
    for (let j = 0; j < bench.length; j++) {
      const sj = sig(bench[j]);
      if (tried.has(sj)) continue;
      tried.add(sj);
      for (let i = 0; i < set.length; i++) {
        if (sig(set[i]) === sj) continue;
        const trial = set.slice();
        trial[i] = bench[j];
        const s = lineupScore(m, ps, trial, ctx);
        if (s > score + 0.5 && (!best || s > best.s || (s === best.s && (i < best.i || (i === best.i && j < best.j))))) best = { i, j, s };
      }
    }
    if (!best) break;
    const out = set[best.i];
    set[best.i] = bench[best.j];
    bench[best.j] = out;
    score = best.s;
  }
  // The experimental planner can cross a two-piece activation valley that single swaps cannot cross.
  // At most nine pair swaps; the existing role penalties still apply to the complete candidate.
  if (m.botPlanner === 'beam' && bench.length >= 2 && set.length >= 2) {
    const incoming = bench.slice(0, 3), outgoing = set.slice().sort((a,b) => value.get(a.uid) - value.get(b.uid)).slice(0,3);
    let best = null;
    for (let a = 0; a < incoming.length; a++) for (let b = a + 1; b < incoming.length; b++) {
      for (let c = 0; c < outgoing.length; c++) for (let d = c + 1; d < outgoing.length; d++) {
        const trial = set.filter(p => p !== outgoing[c] && p !== outgoing[d]).concat(incoming[a], incoming[b]);
        const s = lineupScore(m, ps, trial, ctx);
        if (s > score + .5 && (!best || s > best.score)) best = { set: trial, score: s };
      }
    }
    if (best) { set = best.set; score = best.score; const ids = new Set(set.map(p => p.uid)); bench = seed.filter(p => !ids.has(p.uid)); }
  }
  return { set, bench, score };
}

/** buyScore with a fresh context (tests). */
export function buyScoreOf(m, ps, id) {
  return buyScore(m, ps, id, context(m, ps));
}

/** Shop / reward score of acquiring one copy of chess `id` (0 = not worth it). */
function buyScore(m, ps, id, ctx) {
  const gd = ps?.gd || m.gd;
  const c = chessRec(m, id, ps);
  if (!c) return 0;
  let s = power(c) * 0.6;
  if (ctx.focus && gd.bandBondIds(ps.bandId).includes(ctx.focus) && c.bonds?.includes(ctx.focus)) s += 8;
  const tr = traitsOf(m, c);
  if (m.round <= 11) s += tr.recurring * 3 + tr.gain * 2 + tr.econ * (m.round <= 7 ? 2 : 0);
  s += growthValue(gd, ps, c, m.round) * 0.7;
  s += routeAffinity(gd, ps, c, ctx, m.round);
  const base = gd.baseIdOf(id);
  if (!c.isGolden) {
    const copies = ctx.copies.get(base) || 0;
    if (copies > 0) {
      // merge progress: an elite plus the merge's free next-tier reward (MERGE_HIT) — for any pair; a new pair of a
      // non-keeper only while the bench has room for it (cheap tiers: the third copy is hunted with refreshes)
      const keep = ctx.keep.has(base);
      if (copies + 1 >= mergeNeed(m, base)) s += keep ? 40 : 30;
      else s += keep ? 14 : ctx.pairs < MAX_PAIRS && c.tier <= 3 ? 6 : 1;
    }
  }
  if (!ctx.owned.bases.has(base)) s += bondValue(m, c, ctx.owned, ctx.focus, ctx.second);
  // role needs
  if (isBlocker(c) && ctx.roles.blockers < 2) s += 10;
  if (hitsFly(c) && ctx.fly > 0 && ctx.roles.antiAir < 2) s += 8;
  if (isHealer(c)) s += ctx.roles.healers === 0 && m.round >= 3 ? 6 : ctx.roles.healers >= 2 ? -14 : -3;
  if (c.attackKind === 'none' && !isHealer(c)) s -= 4;
  if (ctx.model && !isHealer(c)) s += ARMOR_WEIGHT * 0.6 * (armorFit(ctx.model, c) - 0.6);
  // the player's own 自选 piece (a slotted slot: its composed record carries diyFor) — AI 托管 of a human with picks
  if (c.diyFor) s += DIY_PIECE_BONUS;
  return s;
}

// ---------------------------------------------------------------------------------------------------
// field model: where the round's enemies walk / fly over the own board, and an exposure model of a layout

const inRect = (r, c) => r >= FIELD.r0 && r <= FIELD.r1 && c >= 0 && c <= FIELD.c1;

/** Integer tiles along a polyline of [row, col] points (inclusive, consecutive duplicates removed). */
function traceLine(points) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [r0, c0] = points[i];
    const [r1, c1] = points[i + 1];
    const n = Math.max(1, Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let k = 0; k <= n; k++) {
      const t = [Math.round(r0 + ((r1 - r0) * k) / n), Math.round(c0 + ((c1 - c0) * k) / n)];
      const last = out[out.length - 1];
      if (!last || last[0] !== t[0] || last[1] !== t[1]) out.push(t);
    }
  }
  return out;
}

/** Boss field → own board: board.js boardTileOf (board rows 9–12 are boss rows 2–5; the right side mirrored). */
const BOSS_MID_COL = 10;
/** Dwell (s) the planner assumes on a leader's first own tiles (several leaders fight from their spawn point). */
const BOSS_DWELL = 30;
/** A leader is modeled as LEADER_WEIGHT enemies of LEADER_HP each (its route draws the damage dealers). */
const LEADER_WEIGHT = 10;
const LEADER_HP = 40000;

/** The boss-round wave of a player's group and its side ('L' | 'R'), or null (Match.bossGroupOf). */
function bossWaveOf(m, ps) {
  const g = typeof m.bossGroupOf === 'function' ? m.bossGroupOf(ps) : null;
  return g && g.wave ? { wave: g.wave, side: g.side } : null;
}

/** Public leader armor, with the same template overrides/spawn multipliers as Battle.spawnEnemy. */
export function bossArmor(m, ps) {
  const wave = bossWaveOf(m, ps)?.wave, spawn = wave?.spawns?.find(s => s.tag === 'boss');
  if (!spawn) return { def: 0, res: 0 };
  const record = (ps.gd || m.gd).enemy(spawn.enemyKey), override = wave.overrides?.[spawn.enemyKey]?.stats;
  const mul = value => Number.isFinite(value) && value >= 0 ? value : 1;
  return { def: Math.max(0, override?.def ?? record?.stats?.def ?? 0) * mul(spawn.mods?.defMul),
    res: Math.max(0, override?.res ?? record?.stats?.res ?? 0) * mul(spawn.mods?.resMul) };
}

/**
 * The round's routes over the own board (cached per round): [{ n, fly (air units: flyers, and the 近地悬浮 HOVER_KEYS
 * on their ground path), tiles: ['r,c'…] (gate → objective, own region only, objective tile excluded), tileTime (s per
 * tile), hp }], a tile → [[route, index]] index, and the
 * aggregated ground flow per tile. Built from the wave preview (spawn counts per route, enemy HP / speed with the
 * round's multipliers). Boss rounds (pass `ps`): the player's boss-field template mapped onto the own board (rows −7,
 * the right player's half mirrored; only the routes that end on the player's half), the leader weighted heavily with
 * a dwell on its first tiles so damage dealers reach it; missing data falls back to every ground path from the own
 * gates.
 */
export function fieldModel(m, ps = null) {
  const boss = m.wave ? null : bossWaveOf(m, ps);
  const wave = m.wave || (boss && boss.wave);
  const cacheKey = `${m.round}|${m.stageId}|${wave ? wave.templateId : 'boss'}|${boss ? boss.side : ''}`;
  if (m._botPath && m._botPath.key === cacheKey) return m._botPath;
  const gd = ps?.gd || m.gd;
  const st = m.stage;
  const gpaths = (st && (st.groundPathsWithDevices || st.groundPaths)) || {};
  const routesOut = [];
  const toBoard = boss
    ? ([r, c]) => boardTileOf(boss.side === 'R' ? 'bossR' : 'bossL', r, c)
    : (p) => p;
  const pushRoute = (tilesRC, n, fly, hp, speed, dwell = 0, leader = false) => {
    const own = tilesRC.map(toBoard).filter(([r, c]) => inRect(r, c)).map(([r, c]) => tileKey(r, c));
    if (own.length > 1) own.pop(); // the objective / last tile: an enemy there has already leaked
    if (!own.length) return;
    const tileTime = Math.max(0.4, Math.min(6, 1 / Math.max(0.05, speed * 0.5)));
    routesOut.push({ n, fly, tiles: own, tileTime, hp: Math.max(100, hp), dwell, boss: leader });
  };
  const routes = wave && Array.isArray(wave.routes) ? wave.routes : [];
  const spawns = wave && Array.isArray(wave.spawns) ? wave.spawns : [];
  // boss pair templates route to both goals: keep the routes ending on this player's half (mirrored for 'R')
  const ownRoute = (rt) => {
    if (!boss || !Array.isArray(rt.end)) return true;
    const endCol = rt.end[1];
    return boss.side === 'R' ? endCol > BOSS_MID_COL : endCol <= BOSS_MID_COL;
  };
  const mirrorRoute = (rt) => {
    // the right player fights the mirror image of the routes that end on the left goal (its own copy of the leader)
    if (!boss || boss.side !== 'R' || !Array.isArray(rt.end) || rt.end[1] > BOSS_MID_COL) return rt;
    const mc = ([r, c]) => [r, BOSS_MIRROR_COL - c];
    return { ...rt, start: mc(rt.start), end: mc(rt.end), checkpoints: Array.isArray(rt.checkpoints) ? rt.checkpoints.map(mc) : [] };
  };
  const foes = new Map(); // DEF|RES → HP share of the round's enemies (effDps)
  if (routes.length && spawns.length) {
    const per = new Map();
    for (const s of spawns) {
      const e = gd.enemy(s.enemyKey);
      const n = Math.max(1, s.count || 1);
      const isLeader = s.tag === 'boss';
      if (s.tag === 'part') continue;
      if (e && e.stats) {
        const k = `${e.stats.def || 0}|${e.stats.res || 0}`;
        foes.set(k, (foes.get(k) || 0) + (isLeader ? LEADER_HP * LEADER_WEIGHT : (e.stats.maxHp || 1000) * n));
      }
      // the leader counts like LEADER_WEIGHT tough enemies: its huge pool makes damage on it worth a lot everywhere
      const hp = isLeader ? LEADER_HP : ((e && e.stats && e.stats.maxHp) || 1000) * ((s.mods && s.mods.hpMul) || 1);
      const spd = ((e && e.stats && e.stats.moveSpeed) || 1) * ((s.mods && s.mods.speedMul) || 1);
      const air = HOVER.has(s.enemyKey);
      const key = `${s.routeIndex}|${isLeader ? 'boss' : ''}|${air ? 'air' : ''}`;
      const a = per.get(key) || { ri: s.routeIndex, boss: isLeader, air, n: 0, hp: 0, spd: 0 };
      a.n += isLeader ? LEADER_WEIGHT : n; a.hp += hp * n; a.spd += spd * n;
      per.set(key, a);
    }
    for (const a of per.values()) {
      let rt = routes[a.ri];
      if (!rt || !Array.isArray(rt.start) || !Array.isArray(rt.end)) continue;
      if (boss && !a.boss && !ownRoute(rt)) continue;
      // in a pair each player fights its own copy of the leader (spawned on its side)
      rt = mirrorRoute(rt);
      const cnt = a.boss ? 1 : a.n;
      const dwell = a.boss ? BOSS_DWELL : 0;
      if (rt.motion === 'FLY') {
        pushRoute(traceLine([rt.start, ...(Array.isArray(rt.checkpoints) ? rt.checkpoints : []), rt.end]), a.n, true, a.hp / cnt, a.spd / cnt, dwell, a.boss);
      } else {
        const key = `${rt.start[0]},${rt.start[1]}->${rt.end[0]},${rt.end[1]}`;
        const path = Array.isArray(gpaths[key]) ? gpaths[key] : traceLine([rt.start, ...(boss && Array.isArray(rt.checkpoints) ? rt.checkpoints : []), rt.end]);
        pushRoute(path, a.n, a.air, a.hp / cnt, a.spd / cnt, dwell, a.boss); // a hovering enemy: ground tiles, air unit
      }
    }
  }
  if (!routesOut.some((r) => !r.fly)) {
    for (const [k, arr] of Object.entries(gpaths)) {
      if (!Array.isArray(arr) || !arr.length) continue;
      const [sr, sc] = String(k).split('->')[0].split(',').map(Number);
      if (!(sr >= FIELD.r0 && sr <= FIELD.r1 && sc <= FIELD.c1)) continue;
      // stage ground paths are in normal-field coordinates: no boss mapping
      const own = arr.filter(([r, c]) => inRect(r, c)).map(([r, c]) => tileKey(r, c));
      if (own.length > 1) own.pop();
      if (own.length) routesOut.push({ n: 3, fly: false, tiles: own, tileTime: 2, hp: 3000, dwell: 0 });
    }
  }
  const index = new Map();
  const ground = new Map();
  routesOut.forEach((rt, ri) => {
    rt.tiles.forEach((k, i) => {
      if (!index.has(k)) index.set(k, []);
      index.get(k).push([ri, i]);
      if (!rt.fly) {
        const e = ground.get(k) || { flow: 0, prog: 0 };
        e.flow += rt.n;
        e.prog = Math.max(e.prog, rt.tiles.length > 1 ? i / (rt.tiles.length - 1) : 1);
        ground.set(k, e);
      }
    });
  });
  const flyTotal = routesOut.filter((r) => r.fly).reduce((s, r) => s + r.n, 0);
  let wsum = 0;
  for (const w of foes.values()) wsum += w;
  const armor = [...foes.entries()].map(([k, w]) => { const [def, res] = k.split('|').map(Number); return { def, res, w: w / wsum }; });
  m._botPath = { key: cacheKey, routes: routesOut, index, ground, flyTotal, airflow: airflowOf(st, toBoard, boss && boss.side === 'R'), armor, dps: new Map() };
  return m._botPath;
}

/**
 * 气流 (act2 m01 blowers, sim content/devices.js): own-board tile → { dir, bb } for every tile a (data-)active blower
 * blows over, mapped like the routes (boss rounds: rows −7, the right side mirrored — RIGHT ↔ LEFT). An operator on
 * such a tile facing WITH the flow gets ATK × (1 + blower_s_character[equal].atk), against it [opposite], across it
 * [vertical] (DESIGN §3, research 09 §1.1): the planner scales its DPS accordingly when it picks a direction.
 */
function airflowOf(st, toBoard, mirrored) {
  const out = new Map();
  for (const d of (st && Array.isArray(st.devices) ? st.devices : [])) {
    if (!d || d.role !== 'blower' || d.active === false || d.hidden) continue;
    const bb = (d.skill && d.skill.bb) || {};
    const dir = mirrored ? mirrorDir(normDir(d.dir, 'UP')) : normDir(d.dir, 'UP');
    for (const p of Array.isArray(d.rangeTiles) ? d.rangeTiles : []) {
      if (!Array.isArray(p)) continue;
      const [r, c] = toBoard(p);
      if (inRect(r, c)) out.set(tileKey(r, c), { dir, bb });
    }
  }
  return out;
}

/** ATK factor of an operator standing on `key` facing `dir` in the model's airflow (1 off the flow). */
export function airflowAtkMul(model, key, dir) {
  const f = model && model.airflow instanceof Map ? model.airflow.get(key) : null;
  if (!f) return 1;
  const rel = dir === f.dir ? 'equal' : dir === oppositeDir(f.dir) ? 'opposite' : 'vertical';
  const v = Number(f.bb[`blower_s_character[${rel}].atk`]);
  return Number.isFinite(v) ? Math.max(0, 1 + v) : 1;
}

/** Direction candidates of the planner, in preference order (ties keep the earlier one: RIGHT = toward the gates). */
export const PLAN_DIRS = Object.freeze(['RIGHT', 'UP', 'DOWN', 'LEFT']);

/** Board tile keys covered by a record's range grid standing on (r, c) facing `dir` (grid rotated, DESIGN §3). */
export function rangeTiles(rec, r, c, dir = 'RIGHT') {
  const grid = rec && Array.isArray(rec.rangeGrid) && rec.rangeGrid.length ? rec.rangeGrid : DEFAULT_MELEE_RANGE;
  return grid.map(([dr, dc]) => { const [a, b] = rotateOffset(dr, dc, dir); return tileKey(r + a, c + b); });
}

/**
 * Enemies an attack strikes at once, as a factor on a dealer's DPS (the exposure model gives every unit's DPS to each
 * enemy on a covered tile, so a single-target dealer is overrated in a crowd): 阵法术师 / 轰击术师 strike every enemy in
 * range (sim professions.js rangeAoe, community report E3 after 0.1.0 — the 阵法术师's skill-off pause is the 0.4 of a
 * non-attacker), splash and chain branches a few [ASSUMED values, botbench A/B in BALANCE.md].
 */
const CROWD = Object.freeze({ phalanx: 2, blastcaster: 2, splashcaster: 1.3, aoesniper: 1.3, bombarder: 1.3, chain: 1.4 });
const crowdOf = (rec) => CROWD[rec && rec.subProfessionId] ?? 1;

/** Damage per second of a record (attack / attack interval; healers and non-attackers 0). */
function dpsOf(rec) {
  const st = rec && rec.stats;
  if (!st || isHealer(rec)) return 0;
  const interval = Math.max(0.2, (st.bat || 1) * 100 / Math.max(ASPD_MIN, st.aspd || 100));
  const d = ((st.atk || 0) / interval) * crowdOf(rec);
  return rec.attackKind === 'none' ? d * 0.4 : d;
}

/** Damage per second of a record against one enemy's DEF / RES (one hit mitigated like the sim, damage.js mitigate). */
function dpsVs(rec, def, res) {
  const st = rec && rec.stats;
  if (!st || isHealer(rec)) return 0;
  const interval = Math.max(0.2, (st.bat || 1) * 100 / Math.max(ASPD_MIN, st.aspd || 100));
  const d = (mitigate(st.atk || 0, rec.dmgType === 'arts' ? 'arts' : 'phys', { def, res }) / interval) * crowdOf(rec);
  return rec.attackKind === 'none' ? d * 0.4 : d;
}

/**
 * The record a chess fights with for range purposes: its range grid replaced by the one it is deployed with under the
 * player's loadout — a passive 攻击范围扩大 skill, a module's range or 攻击距离 (shared/loadoutRecord.js attackRangeGrid:
 * what the server's summonRange, the deploy wheel and the card use since 0.1.1) — else the record itself. Cached per
 * player and loadout.
 */
export function rangeRec(ps, rec) {
  if (!rec || !rec.chessId || typeof ps.loadoutFor !== 'function') return rec;
  const lo = ps.loadoutFor(rec);
  const key = `${rec.chessId}|${lo ? `${lo.skill ?? ''}:${lo.module ?? ''}` : ''}`;
  const cache = ps._botRangeRecs || (ps._botRangeRecs = new Map());
  if (cache.has(key)) return cache.get(key);
  let out = rec;
  try {
    // 0.2.0 补位: a human's not-owned chess (AI 托管) is deployed as its stand-in — that body's range
    const body = typeof ps.fieldRecord === 'function' ? ps.fieldRecord(rec) || rec : rec;
    const g = attackRangeGrid(loadoutRecord(body, resolveRecordLoadout(body, lo)));
    if (Array.isArray(g) && g.length && JSON.stringify(g) !== JSON.stringify(rec.rangeGrid)) out = Object.freeze({ ...rec, rangeGrid: g });
  } catch { out = rec; }
  cache.set(key, out);
  return out;
}

/**
 * DPS of a record against the round's enemies: dpsVs averaged over their DEF / RES weighted by HP (the field model's
 * `armor`; cached per round) — physical dealers lose most of their damage on 重甲 waves, arts dealers on high-RES ones.
 * Without a model (or enemies) the raw dpsOf.
 */
export function effDps(model, rec) {
  if (!rec) return 0;
  if (!model || !Array.isArray(model.armor) || !model.armor.length) return dpsOf(rec);
  // (a 自选 record — one DIY slot id, each player's own operator — is cached per operator and skill)
  const id = rec.diyFor ? `${rec.chessId}@${rec.charId}#${rec.skill?.index ?? ''}` : rec.chessId || rec.tokenId || rec.id || rec.name;
  const cache = model.dps instanceof Map ? model.dps : null;
  if (cache && cache.has(id)) return cache.get(id);
  let v = 0;
  for (const a of model.armor) v += a.w * dpsVs(rec, a.def, a.res);
  if (cache) cache.set(id, v);
  return v;
}

/** Share of a dealer's raw DPS that gets through the round's armour (1 for healers / no enemies). */
function armorFit(model, rec) {
  const raw = dpsOf(rec);
  return raw > 0 ? effDps(model, rec) / raw : 1;
}

/** Tunables of the exposure model (tuned offline against the real simulation, tools/matchrun.mjs sweeps). */
export const LAYOUT_PARAMS = Object.freeze({ hold: 4, kill: 1.5, secondHold: 0.5, healHold: 0.5, roadPenalty: 0.15, spread: 99 });

/** Leaders keep a marginal damage objective after trash-kill probability has saturated. */
export function routeValue(route, exposure, params = LAYOUT_PARAMS) {
  const share = exposure / (params.kill * route.hp);
  return route.n * (route.boss ? Math.log1p(share) : 1 - Math.exp(-share));
}

/**
 * Exposure model of a layout: every enemy of route ρ spends tileTime on each tile of its route (plus the hold time
 * of blockers standing on it: hold × blockCnt, later blockers on the same route secondHold ×, healer-covered
 * blockers (1 + healHold) ×) and takes the DPS of every unit whose range covers that tile (flyers: anti-air only).
 * Value = Σρ n × (1 − e^(−exposure / (kill × hp))) — the expected enemies killed.
 */
class Layout {
  constructor(model, params) {
    this.model = model;
    this.p = params;
    this.units = []; // { rec, key, dps, air, ground, block, heal, cover: Set }
    this.risks = new Map();
  }

  value() {
    const { routes } = this.model;
    const p = this.p;
    const cover = new Map(); // key → { g: dps on ground, a: dps on air }
    const healCover = new Map();
    for (const u of this.units) {
      const source = this.units.find(a => a.auraSource && Math.max(Math.abs(a.row - u.row), Math.abs(a.col - u.col)) <= 1
        && (a.auraWide || Math.abs(a.row - u.row) + Math.abs(a.col - u.col) <= 1));
      const aura = source && !u.auraSource ? Math.min(600, u.baseAspd + source.auraBonus) / u.baseAspd : 1;
      for (const k of u.cover) {
        const e = cover.get(k) || { g: 0, a: 0 };
        if (u.ground) e.g += u.dps * aura;
        if (u.air) e.a += u.dps * aura;
        cover.set(k, e);
        if (u.heal) healCover.set(k, (healCover.get(k) || 0) + 1);
      }
    }
    const blockAt = new Map();
    for (const u of this.units) if (u.block > 0 && this.model.ground.has(u.key)) blockAt.set(u.key, (blockAt.get(u.key) || 0) + u.block);
    let total = 0;
    for (const rt of routes) {
      let exp = 0;
      let lastBlock = -Infinity;
      for (let i = 0; i < rt.tiles.length; i++) {
        const k = rt.tiles[i];
        let t = rt.tileTime + (i < 2 && rt.dwell ? rt.dwell : 0);
        if (!rt.fly && blockAt.has(k)) {
          // a blocker right behind another one mostly holds what slipped past; a separate line holds again
          const fresh = i - lastBlock >= p.spread;
          t += p.hold * blockAt.get(k) * (fresh ? 1 : p.secondHold) * (1 + p.healHold * Math.min(2, healCover.get(k) || 0));
          lastBlock = i;
        }
        const c = cover.get(k);
        if (c) exp += t * (rt.fly ? c.a : c.g);
      }
      total += routeValue(rt, exp, p);
    }
    // ranged units standing on a road block and get hit: a small penalty per road tile they occupy
    for (const u of this.units) if (!u.block && this.model.ground.has(u.key)) total -= p.roadPenalty * this.model.ground.get(u.key).flow;
    return total;
  }
}

/** Candidate-local target coverage remains meaningful after the army's kill probability saturates. */
function targetCoverage(model, unit) {
  let weight = 0, covered = 0;
  for (const rt of model.routes) {
    if (rt.fly ? !unit.air : !unit.ground) continue;
    for (let i = 0; i < rt.tiles.length; i++) {
      const w = rt.n * (rt.tileTime + (i < 2 ? rt.dwell || 0 : 0));
      weight += w;
      if (unit.cover.has(rt.tiles[i])) covered += w;
    }
  }
  return weight > 0 ? covered / weight : 0;
}

/** Threat follows gate-to-goal order, not a fixed screen direction; high tiles ahead of the line can be exposed too. */
function backlineRisk(model, unit, allies) {
  let risk = 0, weight = 0;
  const blockers = new Set(allies.filter(a => a.block > 0).map(a => a.key));
  for (const rt of model.routes) {
    if (rt.fly) continue;
    let nearest = 0, distance = Infinity, firstBlock = Infinity;
    for (let i = 0; i < rt.tiles.length; i++) {
      const [r, c] = parseKey(rt.tiles[i]);
      const d = Math.abs(r - unit.row) + Math.abs(c - unit.col);
      if (d < distance) { distance = d; nearest = i; }
      if (blockers.has(rt.tiles[i])) firstBlock = Math.min(firstBlock, i);
    }
    const upstream = Number.isFinite(firstBlock) ? nearest < firstBlock
      ? 1 + (firstBlock - nearest) / Math.max(1, rt.tiles.length) : 0
      : 1 - nearest / Math.max(1, rt.tiles.length - 1);
    risk += rt.n * upstream / (1 + distance);
    weight += rt.n;
  }
  return (weight ? risk / weight : 0) + (model.ground.has(unit.key) ? 0.4 : 0);
}

function placementQuality(layout, unit, map) {
  if (!layout.risks.has(unit.key)) layout.risks.set(unit.key, backlineRisk(layout.model, unit, layout.units));
  const risk = unit.block > 0 ? 0 : layout.risks.get(unit.key);
  if (unit.heal) {
    let patients = 0;
    let frontline = 0;
    for (const ally of layout.units) if (!ally.heal && unit.cover.has(ally.key)) {
      patients += ally.block > 0 ? 3 : ally.dps > 0 ? 1 : 0.5;
      if (ally.block > 0 && layout.model.ground.has(ally.key)) frontline++;
    }
    const needsFront = layout.units.some(a => a.block > 0 && layout.model.ground.has(a.key));
    return { useful: patients > 0, protectedMedic: patients > 0 && risk <= 0.4 && (!needsFront || frontline > 0),
      score: patients * 0.25 - risk * 0.9 + (map.get(unit.key) === 'ranged' ? 0.05 : 0) };
  }
  // A capped/mitigated DPS estimate is not permission to turn an otherwise able attacker away from its targets.
  const coverage = unit.dps > 0 || unit.rec.attackKind !== 'none' ? targetCoverage(layout.model, unit) : 0;
  return { useful: coverage > 0, score: coverage * 0.35 - risk * 0.15 };
}

function unitOf(rec, key, r, c, dir = 'RIGHT', model = null) {
  const block = isBlocker(rec) ? Math.max(1, rec.stats?.blockCnt ?? 1) : 0;
  const atkMul = airflowAtkMul(model, key, dir);
  return {
    rec, key, dir, dps: (rec._botDps ?? effDps(model, rec)) * atkMul, atkMul, air: hitsFly(rec), ground: rec.attackKind !== 'heal' && !isHealer(rec),
    row: r, col: c, auraSource: !!rec._botAuraSource, auraWide: !!rec._botAuraWide, auraBonus: rec._botAuraBonus || 0, baseAspd: rec._botAspd || rec.stats?.aspd || 100,
    block, heal: isHealer(rec), cover: new Set(rangeTiles(rec, r, c, dir)),
  };
}

/** A layout plan: Map uid → tile key, plus `dirs`: Map uid → direction (UP|RIGHT|DOWN|LEFT). */
export class LayoutPlan extends Map {
  constructor(entries) { super(entries); this.dirs = new Map(); this.chosen = null; }
  /** The planned direction of a piece (RIGHT when unplanned). */
  dirOf(uid) { return this.dirs.get(uid) ?? 'RIGHT'; }
}

/** Safe local search for prep/trait relationships; works on plans only, never transient live positions. */
export function* improveGrowthLayoutSteps(m, ps, pieces, original) {
  const gd = ps.gd || m.gd, model = fieldModel(m, ps), map = ps.deployMap();
  const byUid = new Map(pieces.map(p => [p.uid, p]));
  const viewOf = plan => {
    const view = lineupView(m, ps, pieces);
    view.board = new Map([...plan].map(([uid, key]) => [key, { ...byUid.get(uid), dir: planDir(plan, uid) }]));
    view.bonds = computeBonds(gd, view); return view;
  };
  const geometry = plan => {
    const layout = new Layout(model, LAYOUT_PARAMS);
    for (const [uid, key] of plan) {
      const p = byUid.get(uid); if (!p) continue;
      const [r, c] = parseKey(key); layout.units.push(unitOf(rangeRec(ps, gd.chess(p.id)), key, r, c, planDir(plan, uid), model));
    }
    return layout;
  };
  // Match units by uid, including duplicate ordinary/elite operators.
  const keyed = plan => { const l = geometry(plan); let i = 0; for (const [uid] of plan) if (byUid.has(uid)) l.units[i++].uid = uid; return l; };
  const base = keyed(original);
  const acceptable = layout => base.units.every(old => {
    const next = layout.units.find(u => u.uid === old.uid); if (!next) return false;
    const a = placementQuality(base, old, map), b = placementQuality(layout, next, map);
    if (a.useful && !b.useful) return false;
    if (old.heal && a.protectedMedic && !b.protectedMedic) return false;
    if (!old.heal && targetCoverage(model, next) + 1e-9 < targetCoverage(model, old) * .9) return false;
    if (old.block > 0 && model.ground.has(old.key) && !model.ground.has(next.key)) return false;
    return true;
  });
  const priority = bondPlan(m, ps);
  const growthScore = plan => {
    const view = viewOf(plan), end = previewPrep(gd, view, { round: m.round });
    const values = { ...end.gains };
    if (m.round < gd.bossRound) {
      const next = Object.assign(Object.create(view), { layers: end.layers, funds: gd.income(m.round + 1) + botIncomeFor(ps, m.round + 1) + end.pendingFunds,
        pendingFunds: 0, round: { spent: 0, gainedChess: 0, refreshes: 0 } });
      const begin = previewPrep(gd, next, { event: 'SERVER_PREP_START', round: m.round + 1 });
      for (const [id, n] of Object.entries(begin.gains)) values[id] = (values[id] || 0) + n * .5;
    }
    let value = 0;
    for (const [id, n] of Object.entries(values)) if (!gd.bond(id)?.noStack) value += Math.min(30, n) * (priority.subBonds.includes(id) || priority.focus === id ? .12 : .04);
    // Actual battle grants and range observers also matter, but never enable growth in boss/hidden combat.
    const battle = previewBattleGrowth(gd, view, m.round, p => chessRec(m, p.id, view));
    for (const [id, n] of Object.entries(battle.gains)) value += Math.min(40, n) * (priority.subBonds.includes(id) || priority.focus === id ? .025 : .005);
    return Math.min(16, value);
  };
  const clone = plan => { const out = new LayoutPlan(plan); out.dirs = new Map(plan.dirs); return out; };
  let best = clone(original), score = base.value() + growthScore(best), tries = 0;
  const sources = pieces.filter(p => engineProfile(gd, gd.chess(p.id)).position || engineProfile(gd, gd.chess(p.id)).copy);
  for (const p of sources.slice(0, 4)) {
    const host = best.get(p.uid); if (!host) continue;
    const spots = [host];
    for (const [uid, key] of best) if (uid !== p.uid) {
      const [r, c] = parseKey(key);
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const k = tileKey(r + dr, c + dc);
        if (!spots.includes(k) && canPlace(map, placeClass(ps, gd.chess(p.id)), r + dr, c + dc)) spots.push(k);
      }
    }
    let winner = best, winnerScore = score;
    for (const key of spots.slice(0, 9)) for (const dir of PLAN_DIRS) {
      if (tries++ >= 96) break;
      const trial = clone(best), occupant = [...trial].find(([uid, k]) => k === key && uid !== p.uid);
      if (occupant) {
        const [r, c] = parseKey(host);
        if (!canPlace(map, placeClass(ps, gd.chess(byUid.get(occupant[0]).id)), r, c)) continue;
        trial.set(occupant[0], host);
      }
      trial.set(p.uid, key); trial.dirs.set(p.uid, dir);
      const layout = keyed(trial);
      if (!acceptable(layout)) continue;
      const value = layout.value() + growthScore(trial);
      if (value > winnerScore + .05) { winner = trial; winnerScore = value; }
    }
    best = winner; score = winnerScore; yield;
  }
  // Preserve the default when there are no sources or no compatible gain.
  return best;
}

const botIncomeFor = (ps, r) => ps.isBot ? r >= 9 ? 4 : r >= 6 ? 2 : r >= 3 ? 1 : 0 : 0;

/**
 * Plan tiles and directions for `pieces` (chess or token pieces with `id`): blockers first, then damage dealers by
 * DPS, then healers and the rest; each takes the legal free (tile, direction) with the best marginal layout value
 * (directions in PLAN_DIRS order, a direction whose rotated range equals an earlier one's is skipped; one rng draw per
 * tile breaks ties between tiles). Returns a LayoutPlan (Map uid → key, `.dirs` uid → dir).
 * @param {import('./Match.js').Match} m
 * @param {import('./PlayerState.js').PlayerState} ps
 */
export function planLayout(m, ps, pieces, params = LAYOUT_PARAMS, opts = {}) {
  return runSteps(planLayoutSteps(m, ps, pieces, params, opts));
}

/** planLayout as a step generator: yields after each placed piece (Match slices a bot's prep, see botPrepBeginSteps). */
export function* planLayoutSteps(m, ps, pieces, params = LAYOUT_PARAMS, { occupied = new Set(), recOf = null } = {}) {
  const model = fieldModel(m, ps);
  const map = ps.deployMap();
  const pgd = ps.gd || m.gd;
  const rec = recOf || ((p) => (p.kind === 'token' ? pgd.token(p.id) : rangeRec(ps, pgd.chess(p.id))));
  const layout = new Layout(model, params);
  const hasBlockers = pieces.some(p => isBlocker(rec(p)));
  const rank = (p) => { const r = rec(p); return isBlocker(r) ? 0 : isHealer(r) ? hasBlockers ? 1 : 2 : hasBlockers ? 2 : 1; };
  const order = pieces.slice().sort((a, b) => rank(a) - rank(b) || (rec(b)._botDps ?? dpsOf(rec(b))) - (rec(a)._botDps ?? dpsOf(rec(a))) || a.uid - b.uid);
  const taken = new Set(occupied);
  const out = new LayoutPlan();
  for (const p of order) {
    const r0 = rec(p);
    if (!r0) continue;
    let best = null;
    let bestV = -Infinity;
    let usefulBest = null, usefulV = -Infinity;
    let protectedMedic = null, protectedV = -Infinity;
    // a "只能部署在召唤者攻击范围内" summon (伺夜's 狼群, 缪尔赛思's 流形): only the tiles of its owner's range
    const within = p.kind === 'token' && typeof ps.summonRange === 'function' ? ps.summonRange(p) : null;
    // and an outside-bound one (凯尔希·思衡托's 战术锚点): never a tile of its owner's range
    const without = p.kind === 'token' && typeof ps.summonExcluded === 'function' ? ps.summonExcluded(p) : null;
    // ground tiles for a MELEE blocker. placeClass 'all' on a MELEE record is a chess whose trait reads 「可以放置于远程位」
    // (歌蕾蒂娅, 崖心, 见行者, any module): it may stand on a 高台, and when one of those tiles covers the enemy road it is
    // planned there even with the ground free (owner 2026-10-04: the bot uses the 高台; 2026-10-05: every such chess).
    const cls = p.kind === 'token' ? positionClass(r0) : placeClass(ps, pgd.chess(p.id) || r0);
    const preferHigh = cls === 'all' && basePositionClass(r0) === 'melee';
    let bestHigh = null;
    let bestHighV = -Infinity;
    let usefulHigh = null, usefulHighV = -Infinity;
    // a blocker whose range is its own tile only (range 0-1: 角峰, 古米, 泡泡, 折桠, 菲莱, 蛇屠箱, 塞雷娅, 余) neither blocks nor
    // hits anything off the enemy road — the official range "0-1" (excel range_table) is the one grid (0,0) — so a free road tile
    // comes first (the kill estimate saturates in a full layout and then cannot tell the tiles apart)
    const preferRoad = isBlocker(r0) && r0.rangeGrid?.length === 1 && r0.rangeGrid[0].every((v) => v === 0);
    let bestRoad = null;
    let bestRoadV = -Infinity;
    let usefulRoad = null, usefulRoadV = -Infinity;
    for (const [r, c] of legalTiles(map, cls)) {
      const k = tileKey(r, c);
      if (taken.has(k) || (within && !within.has(k)) || (without && without.has(k))) continue;
      const noise = m.rngBots() * 1e-6;
      const seen = new Set();
      for (const dir of PLAN_DIRS) {
        const u = unitOf(r0, k, r, c, dir, model);
        // (the same covered tiles under a different airflow ATK factor are a different candidate)
        const sig = `${u.atkMul}|${[...u.cover].sort().join(' ')}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const quality = placementQuality(layout, u, map);
        layout.units.push(u);
        const v = layout.value() + quality.score + noise;
        layout.units.pop();
        if (v > bestV) { bestV = v; best = [k, r, c, dir]; }
        if (quality.useful && v > usefulV) { usefulV = v; usefulBest = [k, r, c, dir]; }
        if (quality.protectedMedic && v > protectedV) { protectedV = v; protectedMedic = [k, r, c, dir]; }
        // (the best road tile by the same value)
        if (preferRoad && model.ground.has(k) && v > bestRoadV) { bestRoadV = v; bestRoad = [k, r, c, dir]; }
        if (quality.useful && preferRoad && model.ground.has(k) && v > usefulRoadV) { usefulRoadV = v; usefulRoad = [k, r, c, dir]; }
        if (preferHigh && map.get(k) === 'ranged' && [...u.cover].some((ck) => model.ground.has(ck)) && v > bestHighV) {
          bestHighV = v;
          bestHigh = [k, r, c, dir];
        }
        if (quality.useful && preferHigh && map.get(k) === 'ranged' && v > usefulHighV) {
          usefulHighV = v; usefulHigh = [k, r, c, dir];
        }
      }
    }
    const pick = protectedMedic || usefulHigh || usefulRoad || usefulBest || bestHigh || bestRoad || best;
    if (!pick) continue;
    taken.add(pick[0]);
    layout.units.push(unitOf(r0, pick[0], pick[1], pick[2], pick[3], model));
    layout.risks.clear();
    out.set(p.uid, pick[0]);
    out.dirs.set(p.uid, pick[3]);
    yield;
  }
  return out;
}

/** A plan's direction for a piece (plans without directions ⇒ RIGHT). */
const planDir = (plan, uid) => (plan && plan.dirs instanceof Map ? plan.dirs.get(uid) : null) ?? 'RIGHT';

/** Layout-model variants the rehearsal compares (the first one is the default plan). */
export const REHEARSAL_VARIANTS = Object.freeze([
  {},
  { spread: 3, secondHold: 0.2 },
  { hold: 2 },
  { hold: 8 },
  { kill: 3 },
]);

/** Distinct plans (same unit → tile assignment ⇒ one candidate), in order. */
function distinctPlans(plans, chosen = []) {
  const out = [];
  const seen = new Set();
  for (const plan of plans) {
    const sig = [...plan.entries()].sort((a, b) => a[0] - b[0]).map(([u, k]) => `${u}@${k}:${planDir(plan, u)}`).join(' ')
      + (plan.chosen || chosen).map(p => `${p.uid}:${(p.items || []).map(it => it.id).join(',')}`).join(';');
    if (!seen.has(sig)) { seen.add(sig); out.push(plan); }
  }
  return out;
}

/** Counted leaks of the bot's player in a (possibly still running) rehearsal battle. */
function countedLeaks(battle, playerId) {
  const r = battle.result();
  const pp = r && r.perPlayer && r.perPlayer[playerId];
  return pp ? (pp.leaked || []).filter((l) => l && l.counted !== false).length : 0;
}

/** Single-field LP risk before possible teammate rescue, plus carried operator survival. No lpr sum in normal rounds. */
export function normalRehearsalMetrics(pp, { cap = Infinity, lp = Infinity, growth = 0 } = {}) {
  const payable = (pp.leaked || []).filter(chargeableLeak).length;
  const potentialLpLoss = Math.min(Math.max(0, cap), payable);
  const opUids = new Set((pp.unitStats || []).filter(u => u.kind === 'op').map(u => u.uid));
  const ops = (pp.unitsEnd || []).filter(u => opUids.has(u.uid));
  const standing = ops.filter(u => u.alive).length / Math.max(1, ops.length);
  const hp = ops.reduce((n,u) => n + (u.alive ? Math.max(0, Math.min(1, u.hpPct || 0)) : 0), 0) / Math.max(1, ops.length);
  const fatalWithoutRescue = potentialLpLoss >= Math.max(1, lp);
  // The LP term dominates all bounded tie breakers. Uncapped pressure still matters under the per-round cap.
  const score = -(fatalWithoutRescue ? 100000 : 0) - potentialLpLoss * 1000 - Math.min(100,payable) * 2
    + Math.min(100,pp.killed || 0) * .1 + standing * 6 + hp * 2 + Math.min(4, Math.max(0,growth) * .01);
  return { score, payableLeaks: payable, potentialLpLoss, fatalWithoutRescue, operatorSurvival: standing, operatorHp: hp };
}

/**
 * Rehearsal job: a player "tries out" candidate layouts — each distinct plan (up to m.botRehearsal) is simulated once
 * against the round's enemies with the real Battle (a rehearsal seed, never the real battle's; no onBattleStart meta
 * dispatch, so it has no side effect on the match) and the plan with the fewest counted leaks (then most kills) wins.
 * Every candidate's Battle is built right away (each layout is on the board only while its input is taken; the board
 * is restored exactly before this returns), so the job can be stepped later: `job.run(budgetMs)` simulates until the
 * wall-clock budget is used (checked every 4 ticks) and returns true once every candidate is done. A candidate whose
 * counted leaks already exceed the best finished one's stops early (it can no longer win).
 * A whole rehearsal is 0.2–1 s of CPU late in a 4-bot match: Match runs it in bounded slices between other callbacks.
 * @returns {null | { chosen: any[], plans: Array<Map<number, string>>, best: Map<number, string>, done: boolean, run: (budgetMs?: number) => boolean }}
 *   null when there is nothing to compare (no wave, < 2 distinct plans, rehearsal off)
 */
export function createRehearsal(m, ps, chosen, plans) {
  return runSteps(createRehearsalSteps(m, ps, chosen, plans));
}

/**
 * createRehearsal as a step generator: yields after each candidate's Battle is built. Each candidate puts its layout on
 * the board, takes the battle input and restores the board exactly before the next yield — a bot prep dropped between
 * two steps (the prep ended) never leaves a rehearsal layout on the board.
 */
export function* createRehearsalSteps(m, ps, chosen, plans, { allowSingle = false } = {}) {
  const group = m.wave ? null : bossWaveOf(m, ps);
  const wave = m.wave || group?.wave;
  const boss = !!group;
  const hidden = boss && m.round === m.gd.hiddenRound && m.round !== m.gd.bossRound;
  const survivalObjective = !boss && m.botPlanner === 'beam';
  const distinct = distinctPlans(plans, chosen);
  if (!wave || distinct.length < (allowSingle ? 1 : 2) || !(m.botRehearsal > 0)) return null;
  const cands = distinct.slice(0, m.botRehearsal);
  const battles = [];
  for (const plan of cands) {
    try {
      const roster = plan.chosen || chosen, byUid = new Map(roster.map(p => [p.uid, p]));
      // Shadow state: no transient layouts, recompute, equipment grants or pool/UID changes on the real player.
      const view = Object.create(ps);
      view.board = new Map([...plan].filter(([uid]) => byUid.has(uid)).map(([uid, key]) => [key, { ...byUid.get(uid), dir: planDir(plan, uid) }]));
      view.hand = ps.hand.map(p => p && !byUid.has(p.uid) ? p : null);
      view.temp = ps.temp.map(p => p && !byUid.has(p.uid) ? p : null);
      for (const p of ps.board.values()) if (p.kind === 'chess' && !byUid.has(p.uid)) {
        const idx = freeSlot(view.hand);
        if (idx >= 0) view.hand[idx] = p;
      }
      view.bonds = computeBonds(ps.gd || m.gd, view);
      const prep = previewPrep(ps.gd || m.gd, view, { round: m.round });
      view.layers = prep.layers;
      view.bonds = computeBonds(ps.gd || m.gd, view);
      const shadow = Object.create(m);
      shadow.rngBots = createRng(deriveSeed(m.seed, `rehearse-tokens:${m.round}:${ps.seat}`));
      const owners = new Set(roster.map(p => p.uid)), seen = new Set();
      const tokens = [...ps.board.values(), ...ps.hand, ...ps.temp].filter(p => {
        if (!p || p.kind !== 'token' || !owners.has(p.ownerUid)) return false;
        const key = `${p.ownerUid}|${p.id}`;
        if (seen.has(key)) return false; seen.add(key); return true;
      });
      const tokenPlan = planLayout(shadow, view, tokens, LAYOUT_PARAMS, { occupied: new Set(view.board.keys()) });
      for (const token of tokens) if (tokenPlan.has(token.uid)) view.board.set(tokenPlan.get(token.uid), { ...token, dir: planDir(tokenPlan, token.uid) });
      const side = group?.side || 'L', input = structuredClone(view.battleInput({ side, colOffset: side === 'R' ? 8 : 0 }));
      input.contentInfo = { round: m.round, kind: boss ? hidden ? 'hidden' : 'boss' : 'normal', shopLevel: ps.shop.level,
        funds: prep.funds, handUnits: view.hand.filter(Boolean).length, handChess: view.hand.filter(p => p?.kind === 'chess').length,
        roundStats: prep.stats, matchBands: m.alivePlayers().map(p => p.bandId), teammates: m.alivePlayers().filter(p => p !== ps).map(p => ({ playerId: p.playerId, bandId: p.bandId })) };
      input.lpForBoss = boss ? Math.max(1, m.teamLp ?? m.alivePlayers().reduce((sum, p) => sum + Math.max(0, p.lp), 0)) : ps.lp;
      const spawns = boss ? [...wave.spawns, ...bountySpawns(m.gd, m.round, wave, ps.bounties, ps.playerId, { solo: m.isSolo, side })]
        : withBounties(m.gd, m.round, wave, ps.bounties, ps.playerId);
      const pool = boss ? new SharedBossPool(bossPoolHp(m.gd, hidden ? m.hiddenBossId : m.bossId, m.alivePlayers().length)) : null;
      const trial = m.newBattle({
        seed: deriveSeed(m.seed, `rehearse:${m.round}:${ps.seat}`), kind: boss ? (hidden ? 'hidden' : 'boss') : 'normal', modeId: m.modeId, round: m.round,
        stageId: m.stageId, rect: { ...(boss ? GEO.BOSS_RECT : GEO.NORMAL_RECT) }, timeLimit: boss ? 60 : wave.timeLimit, players: [input],
        spawns: m._sanitizeSpawns(spawns, ps.playerId), routes: wave.routes, sharedBoss: pool,
        flags: { layerGainsEnabled: !boss, ...m.gd.dp, ...(boss ? { enemyScale: m.gd.enemyScale(m.round) } : {}) }, fieldId: `r:${ps.playerId}`, enemyOverrides: wave.overrides, waveId: wave.templateId,
        bossId: boss ? (hidden ? m.hiddenBossId : m.bossId) : undefined,
      });
      trial._botPrepGrowth = Object.values(prep.gains).reduce((n, x) => n + Math.min(50, x), 0);
      if (boss && typeof trial.on === 'function') {
        trial._botTeamLp = input.lpForBoss;
        trial._botHitCaps = 0;
        const lose = n => { trial._botTeamLp -= Math.max(0, Number(n) || 0); if (trial._botTeamLp <= 0) trial.forceEnd('forced'); };
        trial.on('enemyLeak', c => lose(c.enemy?.lpr ?? c.enemy?.def?.lpr ?? 1));
        trial.on('lpLoss', c => lose(c.amount));
        const fx = trial.fx.bind(trial);
        trial.fx = (kind, obj) => { if (kind === 'hitCap') trial._botHitCaps++; return fx(kind, obj); };
      }
      battles.push(trial);
    } catch (e) {
      m.log.warn?.(`[match ${m.roomCode}] bot rehearsal failed: ${e && e.message}`);
      return null;
    }
    yield;
  }
  const cap = Math.ceil(((boss ? 60 : wave.timeLimit || 60) + 5) * 30);
  let i = 0;
  let t = 0;
  let bestScore = -Infinity;
  let bestLeaks = Infinity;
  let bestPotentialLoss = Infinity;
  const job = {
    chosen,
    plans: cands,
    best: cands[0],
    metrics: [],
    done: false,
    run(budgetMs = Infinity) {
      const timed = Number.isFinite(budgetMs);
      const t0 = timed ? performance.now() : 0;
      let n = 0;
      while (i < battles.length) {
        // a candidate that ended mid-slice (finished, cap, or beaten at a 64-tick check that skipped the budget test):
        // check the budget before stepping the next one, so a slice never exceeds 4 ticks past its budget
        if (timed && n > 0 && performance.now() - t0 >= budgetMs) return false;
        const battle = battles[i];
        try {
          let beaten = false;
          while (t < cap && !battle.finished) {
            battle.step();
            t++;
            n++;
            if (!boss && (t & 63) === 0 && bestLeaks < Infinity) {
              const worse = survivalObjective
                ? normalRehearsalMetrics(battle.result()?.perPlayer?.[ps.playerId] || {}, { cap: m.gd.lpCapPerRound, lp: ps.lp }).potentialLpLoss > bestPotentialLoss
                : countedLeaks(battle, ps.playerId) > bestLeaks;
              if (worse) { beaten = true; break; }
            }
            if (timed && (n & 3) === 0 && performance.now() - t0 >= budgetMs) return false;
          }
          if (!beaten) {
            if (!battle.finished) battle.forceEnd('timeout');
            const r = battle.result();
            const pp = r && !r.synthetic && r.perPlayer && r.perPlayer[ps.playerId];
            if (pp) {
              const leaks = (pp.leaked || []).filter((l) => l && l.counted !== false).length;
              const growth = Object.values(pp.layerGains || {}).reduce((n, x) => n + Math.min(50, x), 0) + battle._botPrepGrowth;
              const risk = normalRehearsalMetrics(pp, { cap: m.gd.lpCapPerRound, lp: ps.lp, growth });
              const score = boss ? bossRehearsalScore(battle, ps.playerId) - i * 0.01 : survivalObjective
                ? risk.score - i * .01 : -leaks * 1000 + (pp.killed || 0) + Math.min(8, growth * .035) - i * 0.01;
              job.metrics.push({ candidate: i, score, time: battle.time, bossDamage: pp.bossDamage || 0, cleared: boss && battle.sharedBoss?.hp <= 0, leaks, errors: battle.errorCount || 0,
                killed: pp.killed || 0, damage: pp.damageDealt || 0, survivors: (pp.unitsEnd || []).filter(u => u.alive).length,
                ...(!boss ? { potentialLpLoss: risk.potentialLpLoss, payableLeaks: risk.payableLeaks, operatorSurvival: risk.operatorSurvival, operatorHp: risk.operatorHp } : {}),
                ...(boss ? { lp: battle._botTeamLp, hitCaps: battle._botHitCaps } : {}) });
              if (score > bestScore) { bestScore = score; bestLeaks = leaks; bestPotentialLoss = risk.potentialLpLoss; job.best = cands[i]; }
            }
          }
        } catch (e) {
          m.log.warn?.(`[match ${m.roomCode}] bot rehearsal failed: ${e && e.message}`);
        }
        battles[i] = null;
        i++;
        t = 0;
      }
      job.done = true;
      return true;
    },
  };
  return job;
}

/** Successful clears outrank partial damage; compare time once the same pool has been emptied. */
export function bossRehearsalScore(battle, playerId) {
  if (battle.errorCount || battle.result()?.synthetic || battle._botTeamLp <= 0) return -Infinity;
  const pool = battle.sharedBoss, pp = battle.result()?.perPlayer?.[playerId];
  if (!pool || !pp) return -Infinity;
  const alive = (pp.unitsEnd || []).filter(u => u.alive).length;
  return (pool.hp <= 0 ? 1e9 - battle.time * 1e5 : Math.min(1, (pp.bossDamage || 0) / pool.maxHp) * 1e6)
    + alive * 100 - (pp.leaked || []).filter(l => l.counted !== false).length * 1000;
}

/**
 * Synchronous rehearsal (tools, tests): see createRehearsal. The board is restored exactly afterwards.
 * @returns {Map<number, string>} the chosen plan
 */
export function rehearse(m, ps, chosen, plans) {
  const job = createRehearsal(m, ps, chosen, plans);
  if (!job) return distinctPlans(plans)[0] || plans[0];
  job.run();
  return job.best;
}

// ---------------------------------------------------------------------------------------------------
// prep routine

function tryDo(fn) {
  try { const r = fn(); return !!(r && r.ok); } catch { return false; }
}

function canUseItem(m, ps, item) {
  const rec = m.gd.item(item.id);
  if (!rec) return false;
  if (rec.itemType === 'MAGIC') return m.registry.has('item:' + itemKey(item.id));
  const consume = typeof rec.kind === 'string' && rec.kind.startsWith('consume_on_equip');
  if (consume) return m.registry.has('item:' + itemKey(item.id));
  return true;
}

function context(m, ps) {
  ps._botGrowthContext = { layerGainsEnabled: m.round < m.gd.bossRound,
    duration: Math.min(60, m.wave?.timeLimit || 40), enemies: m.wave?.spawns?.length ?? 8 };
  const owned = ownedBonds(m, ps);
  const model = fieldModel(m, ps);
  const plan = bondPlan(m, ps, owned);
  const copies = copyCounts(m, ps);
  let pairs = 0;
  for (const [b, k] of copies) if (k + 1 >= mergeNeed(m, b)) pairs++;
  return { ps, owned, focus: plan.focus, second: plan.second, subBonds: plan.subBonds, routes: plan.routes, keep: keeperBases(m, ps, plan), copies, pairs, roles: roles(m, ps), fly: model.flyTotal, model, lineupScores: new Map() };
}

/** Features of a legal PREP branch, not a calibrated probability of winning the match. */
export function prepFeatures(m, ps) {
  const ctx = context(m, ps), lineup = chooseLineup(m, ps, ctx), view = lineupView(m, ps, lineup.set), gd = ps.gd || m.gd;
  let damage = 0, blockers = 0, healers = 0, air = 0;
  const armor = bossArmor(m, view);
  for (const p of lineup.set) {
    const c = chessRec(m, p.id, view);
    damage += estimateCombat(gd, view, c, p, { ...armor, boss: m.round >= gd.bossRound }).dps;
    if (isBlocker(c)) blockers++; if (isHealer(c)) healers++; if (hitsFly(c)) air++;
  }
  const reserve = fundsReserve(m, ps), target = LEVEL_TARGET[Math.min(LEVEL_TARGET.length - 1, m.round + 1)];
  return {
    strength: lineup.score / 20, damage: Math.log1p(damage / 1000),
    growth: m.round < gd.bossRound ? growthPlanValue(gd, view, lineup.set, m.round, p => chessRec(m,p.id,view)) / 10 : 0,
    economy: Math.min(30, Math.max(0, ps.funds - reserve)) / 2 + Math.min(reserve, ps.funds) / 4,
    level: Math.min(target, ps.shop.level),
    survival: -Math.max(0, Math.min(2, ctx.roles.blockers) - blockers) - (ctx.roles.healers > 0 && !healers ? 1 : 0)
      - (ctx.fly > 0 && ctx.roles.antiAir > 0 && !air ? 2 : 0) - Math.max(0, Math.min(ps.deployCap, 6) - lineup.set.length),
    core: Math.min(6, view.bonds[ctx.focus]?.count || 0), merges: Math.min(4, ctx.pairs),
  };
}

/** Production action ranking only narrows the branching factor; actual legality is enforced by PlayerState. */
export function* planPrepSteps(m, ps, opts = {}) {
  const rootOwned = new Set(ps.allChess().map(p => p.uid));
  const { cache = true, ...searchOpts } = opts;
  const values = new Map(); let evaluations = 0, cacheHits = 0;
  const rank = (branch, player, actions) => {
    const ctx = context(branch, player), n = player.allChess().length;
    const scored = actions.map(a => {
      let score = -Infinity;
      if (a.type === 'buy' || a.type === 'reward') score = buyScore(branch, player, a.id, ctx);
      if (a.type === 'level' && n >= Math.min(6, player.deployCap)) score = player.shop.level < LEVEL_TARGET[Math.min(15,m.round + 1)] ? 32 : 4;
      if (a.type === 'refresh' && (player.shop.freeRefreshes > 0 || player.funds >= fundsReserve(branch,player) + 3)) score = 10 + refreshValue(branch, player, ctx);
      if (a.type === 'sell' && rootOwned.has(a.uid)) {
        const p = player.allChess().find(x => x.uid === a.uid), deployed = [...player.board.values()].some(x => x.uid === a.uid);
        if (!deployed && p && !ctx.keep.has(branch.gd.baseIdOf(p.id)) && (ctx.copies.get(branch.gd.baseIdOf(p.id)) || 0) <= 1) score = 3;
      }
      return { a, score };
    });
    return scored.filter(x => Number.isFinite(x.score)).sort((a,b) => b.score - a.score).map(x => x.a);
  };
  const result = yield* searchPrepSteps(m, ps, { evaluate: (branch, player) => {
    // Offline collection follows the baseline policy, but must evaluate exactly the same feature definition as beam runtime.
    branch.botPlanner = 'beam';
    const key = cache ? prepSignature(branch,player) : null;
    if (cache && values.has(key)) { cacheHits++; return values.get(key); }
    evaluations++;
    const features = prepFeatures(branch, player), value = { features, score: prepValue(features, m.botPlannerWeights) };
    if (cache) values.set(key,value); return value;
  }, rank, maxNodes: 24, rootLimit: 3, samples: 2, depth: 3, width: 2, ...searchOpts });
  return { ...result, evaluations, cacheHits };
}

/** Visible own item potential, not a promise that every held item is equipped in the future. */
function teamIncomePotential(ps) {
  const items=[...ps.hand,...ps.temp].filter(p=>p?.kind==='item');
  for(const p of ps.allChess())items.push(...(p.items||[]).filter(Boolean));
  let recurring=0,next=0;
  for(const p of items)for(const buff of ps.gd.item(p.id)?.buffs||[]) {
    if(buff.key==='gain_coin_when_round_start')recurring+=Number(buff.bb?.count)||0;
    if(buff.key==='use_equip_gain_coin_when_next_round_start')next+=Number(buff.bb?.count)||0;
  }
  return {recurring,next};
}

/** No Battle, teammate private input, or sampled future transaction is used for this observed first action. */
export function teamPrepFeatures(m,ps,action) {
  const branch=forkPrep(m,ps,{seed:deriveSeed(m.seed,`team-features:${m.round}:${ps.seat}`)});
  try {
    branch.m.botPlanner='beam';
    const base=prepFeatures(branch.m,branch.ps),before=teamIncomePotential(branch.ps);
    const applied=applyPrepAction(branch.m,branch.ps,action);if(!applied.ok)throw new Error(applied.error||'TEAM_ILLEGAL_ACTION');
    const after=action.type==='stop'?base:prepFeatures(branch.m,branch.ps),income=teamIncomePotential(branch.ps);
    const teammates=m.order.filter(p=>p!==ps&&p.alive),min=teammates.length?Math.min(...teammates.map(p=>p.lp)):0;
    return teamRankFeatures(base,after,{action,pressure:1-Math.max(0,Math.min(1,min/30)),round:m.round,
      recurringIncome:income.recurring-before.recurring,nextIncome:income.next-before.next,
      item:m.gd.item(action.id),tier:m.gd.tierOf(action.id)||0});
  } finally {branch.dispose();}
}

/** Restrict teammate inputs to a public status and scout-board whitelist, even though the teacher can clone more. */
export function teamContextPublic(m,ps) {
  return contextPublicTeammates(m,ps);
}
function teamContextTeam(m,ps) {
  const publicPlayers=teamContextPublic(m,ps),alive=publicPlayers.filter(p=>p.alive),armies=alive.map(p=>publicArmySummary(m.gd,p.board));
  return {teamAlive:(alive.length+1)/3,teamMinLp:alive.length?Math.min(...alive.map(p=>p.lp))/30:0,
    teamMinLevel:alive.length?Math.min(...alive.map(p=>p.shopLevel))/6:0,teamMinValue:armies.length?Math.min(...armies.map(a=>a.value))/60:0,
    teamRoleGaps:armies.reduce((n,a)=>n+Number(!a.healers)+Number(!a.blockers)+Number(!a.air),0)/6};
}
/** Readiness is a proxy: active recipients and deployed/hand engines, not a promise of future triggers or damage. */
function teamContextArmy(m,ps) {
  const ctx=context(m,ps),lineup=chooseLineup(m,ps,ctx),view=lineupView(m,ps,lineup.set),gd=ps.gd||m.gd;
  let damage=0,healers=0,blockers=0,air=0,exposure=0,engines=0;
  const armor=bossArmor(m,view),chosen=new Set(lineup.set.map(p=>p.uid));
  for(const p of lineup.set) {
    const c=chessRec(m,p.id,view);damage+=estimateCombat(gd,view,c,p,{...armor,boss:false}).dps;
    healers+=Number(isHealer(c));blockers+=Number(isBlocker(c));air+=Number(hitsFly(c));
  }
  for(const [id,b] of Object.entries(view.bonds))if(b.active) {
    const recipients=lineup.set.filter(p=>receivesBond(gd,view,p,id));
    exposure+=(ps.layers[id]||0)*recipients.length/Math.max(1,lineup.set.length);
  }
  for(const p of ps.allChess()) {
    const profile=engineProfile(gd,chessRec(m,p.id,ps));
    if(profile.recurring&&(chosen.has(p.uid)||profile.hand)&&profile.targets.some(id=>view.bonds[id]?.active
      &&lineup.set.some(q=>receivesBond(gd,view,q,id))))engines++;
  }
  const target=LEVEL_TARGET[Math.min(15,m.round+1)];
  return {round:m.round/14,lp:ps.lp/30,funds:ps.funds/20,level:ps.shop.level/6,upgradeCost:ps.shop.upgradePrice/20,
    levelGap:Math.max(0,target-ps.shop.level)/6,strength:lineup.score/200,damage:Math.log1p(damage/1000)/5,
    fill:lineup.set.length/ps.deployCap,healers:Math.min(2,healers)/2,blockers:Math.min(3,blockers)/3,air:air/ps.deployCap,
    layerExposure:Math.log1p(exposure)/6,readyEngines:engines/4,
    upgradeReach:Number(ps.shop.level<gd.maxShopLevel&&ps.funds>=ps.shop.upgradePrice)};
}
export function contextTeamPrepFeatures(m,ps,action) {
  const branch=forkPrep(m,ps,{seed:deriveSeed(m.seed,`team-context:${m.round}:${ps.seat}`)});
  try {
    branch.m.botPlanner='beam';
    const base=teamContextArmy(branch.m,branch.ps),applied=applyPrepAction(branch.m,branch.ps,action);
    if(!applied.ok)throw new Error(applied.error||'TEAM_ILLEGAL_ACTION');
    const after=action.type==='stop'?base:teamContextArmy(branch.m,branch.ps);
    return contextTeamFeatures(teamPrepFeatures(m,ps,action),base,after,teamContextTeam(m,ps),action);
  }finally{branch.dispose();}
}

/** Same candidate first actions as the offline teacher; the costly multi-round teacher is never called here. */
export function* planTeamPrepSteps(m,ps,{cancelled=()=>false}={}) {
  const local=yield* planPrepSteps(m,ps,{cancelled});if(local.cancelled||cancelled())return {...local,cancelled:true};
  const contextual=m.botTeamModel.kind===CONTEXT_TEAM_KIND;
  const groups=contextual?contextTeamCandidates(local,legalPrepActions(m,ps))
    :[{first:'stop::',action:{type:'stop'}},...local.choices.filter(c=>c.first!=='stop::').slice(0,2).map(c=>({first:c.first,action:c.paths[0][0]}))];
  const candidates=[];
  for(const g of groups) {
    if(cancelled())return {...local,cancelled:true};
    const raw=contextual?contextTeamPrepFeatures(m,ps,g.action):teamPrepFeatures(m,ps,g.action),features=m.botTeamModel.kind===SAFE_TEAM_KIND?safeFeaturesFromLegacy(raw,g.action.type):raw;
    candidates.push({...g,features,score:teamRankScore(features,m.botTeamModel)});yield;
  }
  candidates.sort((a,b)=>b.score-a.score||(a.first==='stop::'?-1:b.first==='stop::'?1:a.first.localeCompare(b.first)));
  const stop=candidates.find(c=>c.first==='stop::'),best=candidates[0],action=best.score>stop.score+m.botTeamModel.margin?best.action:{type:'stop'};
  if(contextual) {
    const guard=selectContextTeamCandidate(candidates,m.botTeamModel),chosen=candidates.find(c=>c.first===guard.selected);
    return {signature:local.signature,action:chosen.action,candidates,score:chosen.score,baselineScore:stop.score,nodes:local.nodes,cancelled:false,guard};
  }
  if(m.botTeamModel.kind===SAFE_TEAM_KIND) {
    const guard=selectSafeTeamCandidate(candidates,m.botTeamModel),chosen=candidates.find(c=>c.first===guard.selected);
    return {signature:local.signature,action:chosen.action,candidates,score:chosen.score,baselineScore:stop.score,nodes:local.nodes,cancelled:false,guard};
  }
  return {signature:local.signature,action,candidates,score:best.score,baselineScore:stop.score,nodes:local.nodes,cancelled:false};
}

/** Offline teacher: finish the existing policy, then evaluate one real layout with the shared Battle engine. */
export function evaluatePrepPath(m, ps, { path = [], seed = deriveSeed(m.seed, `prep-teacher:${m.round}:${ps.seat}`) } = {}) {
  const branch = forkPrep(m, ps, { seed });
  try {
    branch.m.botPlanner = 'beam'; branch.m.botRehearsal = m.botRehearsal;
    for (const action of path) {
      const result = applyPrepAction(branch.m, branch.ps, action);
      if (!result?.ok) return { error: result?.error || 'ILLEGAL_PATH' };
    }
    // Both Stop and alternatives receive the same baseline continuation, with independently sampled future shops.
    const continuation = botPrepBegin(branch.m, branch.ps);
    if (continuation) continuation.run();
    botPrepEnd(branch.m, branch.ps, continuation);
    branch.m.botRehearsal = 1;
    const chosen = [...branch.ps.board.values()].filter(p => p.kind === 'chess');
    const plan = new Map([...branch.ps.board].filter(([,p]) => p.kind === 'chess').map(([key,p]) => [p.uid,key]));
    plan.dirs = new Map(chosen.map(p => [p.uid,p.dir]));
    const job = runSteps(createRehearsalSteps(branch.m, branch.ps, chosen, [plan], { allowSingle: true }));
    if (!job) return { error: 'NO_TEACHER_BATTLE' };
    job.run();
    const metric = job.metrics[0];
    return metric && !metric.errors && !branch.m.errorCount && !branch.m.dispatcher.errors
      ? { ...metric, kind: m.wave ? 'normal' : 'boss-window', objective: 'survival-v2', continuationLayouts: m.botRehearsal,
        rules: prepRuleHash(ps.gd || m.gd) } : { error: 'TEACHER_FAILED' };
  } finally { branch.dispose(); }
}

/** Diagnostic record holds the observed state and the actual sampled paths, never an invented future shop. */
export function prepSearchRecord(m, ps, result) {
  return { version: 1, kind: 'prep-counterfactual', seed: m.seed, round: m.round, playerId: ps.playerId,
    rules: prepRuleHash(ps.gd || m.gd), observation: prepObservation(m,ps), nodes: result.nodes,
    action: result.action, candidates: result.candidates, choices: result.choices, rejected: result.rejected,
    evaluations: result.evaluations, cacheHits: result.cacheHits, objective: 'survival-v2' };
}

/** Normal copies owned per base (board, hand, temp). */
function copyCounts(m, ps) {
  const out = new Map();
  for (const p of ps.allChess()) {
    if (m.gd.isGolden(p.id)) continue;
    const b = m.gd.baseIdOf(p.id);
    out.set(b, (out.get(b) || 0) + 1);
  }
  return out;
}

/**
 * Expected value of one shop refresh: Σ over the owned bases one copy short of an elite of P(the refresh shows a copy)
 * × MERGE_HIT, plus the keeper singles × PAIR_HIT. P = 1 − (1 − left / eligible copies)^chess slots — the shop's
 * copy-weighted roll over the shared pool's tiers ≤ shop level (PlayerState._rollChessSlot, pool.js roll).
 */
function refreshValue(m, ps, ctx) {
  const L = ps.shop.level;
  let total = 0;
  for (const e of m.pool.entries.values()) if (e.left > 0 && e.tier <= L) total += e.left;
  if (!(total > 0)) return 0;
  const slots = m.gd.shopSlots(L).chess;
  let v = refreshGrowthValue(ps.gd || m.gd, ps) + bandRefreshUtility(ps.gd || m.gd, ps);
  for (const [b, k] of ctx.copies) {
    const e = m.pool.entries.get(b);
    if (!e || e.left <= 0 || e.tier > L) continue;
    const pShop = 1 - (1 - e.left / total) ** slots;
    if (k + 1 >= mergeNeed(m, b)) v += pShop * MERGE_HIT;
    else if (ctx.keep.has(b)) v += pShop * PAIR_HIT;
  }
  return v;
}

/**
 * Sell the weakest bench chess (temp and hand; the hand only with `handOnly`) that is not part of a merge pair (or
 * anything when keepPairs is false) and does not carry a 突变细胞 (its transformation after the battle is the point).
 * `keepFresh`: never a piece that came this prep (`boughtRound`: bought for the lineup, an elite just merged, a reward)
 * nor one gained since the bot's last prep ended (unseen, see rememberOwned: the operator a 突变细胞 transformation
 * gains joins the bench while its carrier's deployment is free — the placement step decides about it, not the shed's
 * piece value).
 */
function sellWeakestHand(m, ps, { keepPairs = true, below = Infinity, handOnly = false, keepFresh = false } = {}) {
  const ctx = context(m, ps);
  let worst = null;
  let worstV = Infinity;
  for (const p of handOnly ? ps.hand : [...ps.temp, ...ps.hand]) {
    if (!p || p.kind !== 'chess' || (p.items || []).some((it) => isMutationCell(m.gd, it.id))) continue;
    const base = m.gd.baseIdOf(p.id);
    if (keepPairs && !m.gd.isGolden(p.id) && (ctx.copies.get(base) || 0) >= 2) continue;
    if (keepFresh && (p.boughtRound === m.round || unseen(ps, p))) continue;
    const v = pieceValue(m, ps, p, ctx);
    if (v < worstV) { worstV = v; worst = p; }
  }
  if (!worst || worstV >= below) return false;
  return tryDo(() => ps.sell(worst.uid));
}

/**
 * The chess the bot owned when its last prep ended (`ps._botSeenUids`, written by botPrepEndSteps before Ready). A
 * piece outside it was gained after that prep — at SETTLE (a 突变细胞 transformation's operator, battle-result grants),
 * at the round start or in 机变 — and has not been through a placement step yet. No memory yet (a bot's first prep, a
 * seat just put under AI 托管): nothing counts as unseen.
 */
function rememberOwned(ps) {
  ps._botSeenUids = new Set(ps.allChess().map((p) => p.uid));
}
const unseen = (ps, p) => !!ps._botSeenUids && !ps._botSeenUids.has(p.uid);

/** Lineup gain of one copy of chess `id` (full board): best single swap into the current best lineup `cur`. */
function lineupGain(m, ps, id, ctx, cur) {
  const probe = { uid: -1, kind: 'chess', id, items: [] };
  let best = cur.score;
  for (let i = 0; i < cur.set.length; i++) {
    const trial = cur.set.slice();
    trial[i] = probe;
    best = Math.max(best, lineupScore(m, ps, trial, ctx));
  }
  return best - cur.score;
}

/**
 * Prep start: sell bench chess that neither make the lineup nor build toward something (a pair that can still
 * merge, the focus bond, an elite) — they only block merges; the refund buys more. Keeps a few spare bench units.
 */
function sellJunk(m, ps) {
  const ctx = context(m, ps);
  const { bench } = chooseLineup(m, ps, ctx);
  const keep = [];
  const junk = [];
  for (const p of bench) {
    const c = chessRec(m, p.id, ps);
    if (!c) continue;
    const base = m.gd.baseIdOf(p.id);
    const copies = c.isGolden ? 0 : ctx.copies.get(base) || 0;
    // a pair whose third copy can still come (the merge's reward is worth it for any pair)
    const pairLive = copies + 1 >= mergeNeed(m, base) && (m.pool.left(base) > 0 || !m.pool.has(base));
    const useful = c.isGolden || pairLive || ctx.keep.has(base) || (copies >= 2 && m.round <= 6);
    (useful ? keep : junk).push({ p, v: pieceValue(m, ps, p, ctx) + (pairLive ? 150 : useful ? 100 : 0) });
  }
  // bench budget: at most BENCH_BUDGET spare units beyond the lineup (pairs first)
  const all = keep.concat(junk).sort((a, b) => b.v - a.v);
  const budget = growthBenchBudget(ps.gd || m.gd, ps, BENCH_BUDGET);
  for (const { p } of all.slice(budget)) tryDo(() => ps.sell(p.uid));
  if (budget === BENCH_BUDGET) for (const { p } of junk.slice(0, 4)) if (m.round >= 5 && ps.find(p.uid)) tryDo(() => ps.sell(p.uid));
}

/** Take the queued pick-one offers (merge rewards, special refreshes — free; they expire at prep end). */
function takeOffers(m, ps) {
  const gd = ps?.gd || m.gd;
  for (let guard = 0; guard < 4 && ps.offers.length; guard++) {
    const offer = ps.offers[0];
    const ctx = context(m, ps);
    let best = -1;
    let bestS = -Infinity;
    offer.slots.forEach((s, i) => {
      if (s.sold) return;
      const sc = s.kind === 'item' ? (canUseItem(m, ps, s) ? 10 : 1) + gd.tierOf(s.id) * 3 : buyScore(m, ps, s.id, ctx);
      if (sc > bestS) { bestS = sc; best = i; }
    });
    if (best < 0) break;
    if (freeSlot(ps.hand) < 0) sellWeakestHand(m, ps, { keepPairs: false });
    if (!tryDo(() => ps.pickReward(best))) {
      // could not take it (sold out / no room): drop the offer
      ps.offers.shift();
      ps.dirty();
    }
  }
}

/** Fixed-round squad resources: ordinary authoritative intents, scored like free recruits. */
export function takeRecruitment(m, ps) {
  if (!ps.recruitmentSpec()) return;
  for (let guard = 0; guard < 4 && ps.recruitment.charges; guard++) {
    const ctx = context(m, ps);
    if (!ps.recruitment.pending) {
      const samples = ps.allChess().filter(p => ps.recruitmentSample(p.uid));
      // Prefer the highest-tier spare: avoid trading a deployed frontliner while a bench sample exists.
      samples.sort((a, b) => Number(ps.find(a.uid)?.area === 'board') - Number(ps.find(b.uid)?.area === 'board')
        || ps.gd.tierOf(b.id) - ps.gd.tierOf(a.id) || a.uid - b.uid);
      if (!tryDo(() => ps.openRecruitment(samples[0]?.uid))) break;
    }
    const offer = ps.recruitment.pending;
    const best = offer.ids.map((id, idx) => ({ idx, score: buyScore(m, ps, id, ctx) })).sort((a, b) => b.score - a.score || a.idx - b.idx)[0];
    if (!tryDo(() => ps.pickRecruitment(offer.id, best.idx))) { ps.cancelRecruitment(offer.id); break; }
  }
}

/**
 * Prep routine up to the final arrangement, whose default plan is already on the board. Returns the layout
 * rehearsal still to run (Match steps it in wall-clock-bounded slices, then calls botPrepEnd) or null.
 */
export function botPrepBegin(m, ps) {
  return runSteps(botPrepBeginSteps(m, ps));
}

/**
 * botPrepBegin as a step generator (the same actions in the same order, hence the same rng draws and decisions): it
 * yields between whole prep actions — never while the board holds a transient layout — so Match.scheduleBotPrep runs
 * it in wall-clock-bounded slices like the rehearsal (50–120 ms of planning in one callback late in a 4-bot match
 * otherwise). Returns the rehearsal job (or null).
 */
export function* botPrepBeginSteps(m, ps) {
  if (!ps.alive || ps.ready) return null;
  if(m.botPlanner==='team')ps._botPlannerTrace=[];
  if(m.botPlanner==='team'&&teamEligible(m,ps)) {
    try {
      const choice=yield* planTeamPrepSteps(m,ps,{cancelled:()=>m.phase!=='PREP'||!ps.alive||ps.ready});
      const applied=commitPrepChoice(m,ps,choice);
      ps._botPlannerTrace.push({kind:'team',action:choice.action,nodes:choice.nodes,score:choice.score,baselineScore:choice.baselineScore,
        candidates:choice.candidates?.map(c=>({first:c.first,score:c.score})),guard:choice.guard,error:applied.error||null});
    }catch(e){ps._botPlannerTrace.push({kind:'team',error:String(e.message||e)});}
  }
  m.autoPickPersonalChoice(ps, 'bot');
  // 1. reward offers (free)
  takeOffers(m, ps);
  yield;
  // 2. economy: dead bench weight back to funds, units toward a full board, the level curve, then everything else;
  //    merges completed while buying queue reward offers that expire at prep end — take them right away
  sellJunk(m, ps);
  yield;
  // Selective PREP planning is opt-in until outcome validation. Only observed first actions commit; the normal
  // policy completes the prep after at most two transactions. Offline branches must never recurse into planning.
  if (m.botPlanner === 'beam' && !m._botPlanningBranch) ps._botPlannerTrace = [];
  if (m.botPlanner === 'beam' && !m._botPlanningBranch && m.round >= 4 && ps.funds >= 4) {
    for (let i = 0; i < 2; i++) {
      try {
        const result = yield* planPrepSteps(m, ps, { cancelled: () => m.phase !== 'PREP' || !ps.alive || ps.ready });
        const applied = commitPrepChoice(m, ps, result);
        ps._botPlannerTrace.push({ action: result.action, nodes: result.nodes, evaluations: result.evaluations, cacheHits: result.cacheHits, score: result.score,
          baselineScore: result.baselineScore, rejected: result.rejected, error: applied.error || null });
        if (!applied.ok || result.action.type === 'stop') break;
        takeOffers(m, ps);
        yield;
      } catch (e) { ps._botPlannerTrace.push({ error: String(e?.message || e) }); break; }
    }
  }
  // Once a serviceable squad exists, buy the scheduled shop tier before discretionary bench units or refreshes.
  levelUp(m, ps);
  yield* buyLoopSteps(m, ps, { fillOnly: true, maxRefreshes: 0 });
  takeOffers(m, ps);
  levelUp(m, ps);
  yield;
  yield* buyLoopSteps(m, ps, { fillOnly: false, maxRefreshes: MAX_REFRESHES });
  takeOffers(m, ps);
  levelUp(m, ps, { spare: true });
  takeRecruitment(m, ps);
  takeOffers(m, ps);
  maybeFreeze(m, ps);
  yield;
  // 3. placement, 4. items, placement again (item carriers gain value; rehearsed when the match allows it)
  yield* arrangeSteps(m, ps);
  yield* equipItemsSteps(m, ps);
  yield;
  return yield* arrangeSteps(m, ps, { final: true, defer: true });
}

/** Prep routine, end: the rehearsed layout (when it beat the default plan), temp, a free hand slot, Ready. */
export function botPrepEnd(m, ps, job = null) {
  runSteps(botPrepEndSteps(m, ps, job));
}

/** botPrepEnd as a step generator (see botPrepBeginSteps). */
export function* botPrepEndSteps(m, ps, job = null) {
  if (!ps.alive || ps.ready) return;
  if (job && job.done && job.best !== job.plans[0]) yield* applyPlanSteps(m, ps, job.best.chosen || job.chosen, job.best);
  // 5. temp → hand / sell / destroy; keep one hand slot free for next round's merges
  resolveTemp(m, ps);
  if (freeSlot(ps.hand) < 0) freeHandSlot(m, ps);
  // what the next prep's bench shed may judge by value: what is owned now (later gains wait for a placement step)
  rememberOwned(ps);
  m.autoPickPersonalChoice(ps, 'bot');
  tryDo(() => ps.setReady(true));
}

/**
 * Free one hand slot: on a bot's own seat a kept bounty Art goes first (“神秘顾客” pays its fund and passes to a
 * teammate when destroyed, 教鞭 gives nothing — its chance of a perfect-battle payout is worth less than a slot for a
 * merge), else the weakest bench single is sold. A human's seat under AI 托管 never loses an item this way.
 */
function freeHandSlot(m, ps) {
  if (ps.isBot && !ps.autoplay) {
    const art = ps.hand.find((p) => p && p.kind === 'item' && isBountyArt(m.gd, p.id));
    if (art && tryDo(() => ps.destroy(art.uid))) return true;
  }
  return sellWeakestHand(m, ps);
}

/** The whole prep routine in one go (the rehearsal, if any, runs synchronously). */
export function botPrep(m, ps) {
  const job = botPrepBegin(m, ps);
  if (job) job.run();
  botPrepEnd(m, ps, job);
}

/**
 * Freeze the shop (free) when it shows a copy that would complete a held pair and the bot cannot afford it: the unsold
 * slots are kept at the next round start (PlayerState.startRound rollShop keepFrozen), the rest rerolled.
 */
function maybeFreeze(m, ps) {
  if (ps.shop.frozen) return;
  if (ps.shop.slots.some((s) => s && !s.sold && s.kind === 'chess' && ps.priceOf(s) > ps.funds && ps.completesChessMerge(s.id))) tryDo(() => ps.freeze());
}

/** Whether level `lv` of the 调度中心 opens one of the player's slotted 自选 pieces with copies left (player/diy.js). */
export function diyOpensAt(ps, lv) {
  const st = ps.diyStock;
  if (!st || !st.entries || !st.entries.size) return false;
  for (const e of st.entries.values()) if (e.shopLevel === lv && e.left > 0) return true;
  return false;
}

/** The 调度中心 level-ups of a bot's prep (exported for tests). */
export function levelUp(m, ps, { spare = false } = {}) {
  const gd = ps?.gd || m.gd;
  for (let guard = 0; guard < 6; guard++) {
    if (ps.shop.level >= gd.maxShopLevel) return;
    const price = Math.max(0, ps.shop.upgradePrice);
    if (ps.funds < price) return;
    const r = m.round;
    const target = LEVEL_TARGET[Math.min(LEVEL_TARGET.length - 1, r)];
    const nextTarget = LEVEL_TARGET[Math.min(LEVEL_TARGET.length - 1, r + 1)];
    const owned = ps.allChess().length;
    const boardReady = owned >= Math.min(ps.deployCap, r <= 4 ? Math.max(4, r + 1) : 6);
    let want = price === 0;
    if (!want && ps.shop.level < target && boardReady) want = true;
    // a human's 自选 slots of the next level (AI 托管): that step one round earlier (DIY_PIECE_BONUS)
    if (!want && boardReady && ps.shop.level < nextTarget && diyOpensAt(ps, ps.shop.level + 1)) want = true;
    if (!want && ps.shop.level < nextTarget && price <= 2 && boardReady) want = true;
    if (!want && spare && ps.funds >= price + 1 + fundsReserve(m, ps) && ps.shop.level < nextTarget + 1 && boardReady) want = true;
    if (!want && ps.funds >= price + 14) want = true;
    const mergeCosts = ps.shop.slots.filter(s => s && !s.sold && s.kind === 'chess' && ps.completesChessMerge(s.id))
      .map(s => ps.priceOf(s)).filter(p => p <= ps.funds);
    const reserve = Math.max(fundsReserve(m, ps), owned < ps.deployCap && r <= 7 ? 2 : 0,
      mergeCosts.length ? Math.min(...mergeCosts) : 0);
    if (!want || (price > 0 && ps.funds - price < reserve) || !tryDo(() => ps.levelUp())) return;
  }
}

/**
 * Funds a band that keeps its leftover (gd.leftoverKeptBands: 坎诺特 利滚利 "每回合剩余的资金可以继承，剩余至少5资金时，
 * 每回合额外获得1资金") holds back from discretionary spending — refreshes, full-board purchases that complete nothing,
 * items, spare level-ups: the interest capital (coin_carry_over bb.capital, 5). 0 for every other band (their
 * leftover is lost at the prep end, so spending it all is free value).
 */
function fundsReserve(m, ps) {
  const growth = growthReserve(ps.gd || m.gd, ps);
  if (!m.gd.leftoverKeptBands.includes(ps.bandId)) return growth;
  const band = m.gd.band(ps.bandId);
  const buff = band && Array.isArray(band.buffs) ? band.buffs.find((b) => b && b.key === 'coin_carry_over') : null;
  const cap = Number(buff && buff.bb && buff.bb.capital);
  return (Number.isFinite(cap) && cap > 0 ? cap : 5) + growth;
}

/** Buying / rerolling toward the lineup; a step generator (yields after each purchase or reroll). */
function* buyLoopSteps(m, ps, { fillOnly = false, maxRefreshes = 0 } = {}) {
  const gd = ps?.gd || m.gd;
  let refreshes = 0;
  const minPrice = 2;
  // the best lineup is reused while the owned chess stay the same (a refresh changes only the shop)
  let memo = null;
  for (let guard = 0; guard < 40; guard++) {
    if (guard > 0) yield;
    const ctx = context(m, ps);
    const reserve = fundsReserve(m, ps);
    const ownedN = ps.allChess().length;
    const ownKey = `${ps.allChess().map((p) => `${p.uid}:${p.id}:${(p.items || []).map(i=>i.id)}`).join()}|${ctx.focus}|${ctx.subBonds}|${ps.funds}|${ps.round.spent}|${ps.round.gainedChess}|${ps.round.refreshes}`;
    const boardFull = ownedN >= ps.deployCap;
    // the first pass fills the board, then completes the merges it can afford — before any level-up spends the funds
    const mergesOnly = fillOnly && boardFull;
    // keep room for merges: a crowded bench sheds its weakest single — never one that came this prep (the buy picks by
    // lineup gain, the shed by piece value: it used to sell the single just bought for 3–5 back for 1; QA of the 0.1.1
    // bots) nor one gained since the last prep (the operator a 突变细胞 transformation put on the bench, its deployment
    // freed: in 20 solo 绝境 昆图斯 matches the shed sold 44 of 222 before the placement step could deploy them). The
    // shed is pre-emptive (one slot is still free), so with only fresh singles it waits for the next prep.
    const used = ps.hand.filter(Boolean).length;
    if (used >= gd.benchSize - 1) sellWeakestHand(m, ps, { keepFresh: true });
    // a full hand refuses every purchase, the third copy of a held pair too (PlayerState.buy, PRTS 卫戍协议/帮助 §手牌区):
    // an affordable one sheds the weakest hand single first (like the shed above, never one of this prep)
    if (freeSlot(ps.hand) < 0 && ps.shop.slots.some((s) => s && !s.sold && s.kind === 'chess' && ps.priceOf(s) <= ps.funds && ps.completesChessMerge(s.id))) {
      sellWeakestHand(m, ps, { handOnly: true, keepFresh: true });
    }
    let best = -1;
    let bestS = 0;
    let bestMerges = false;
    let bestTrade = false;
    let cur = null;
    ps.shop.slots.forEach((s, i) => {
      if (!s || s.sold) return;
      const price = ps.priceOf(s);
      if (price > ps.funds) return;
      let sc;
      let trade = false;
      if (s.kind === 'chess') {
        const merges = ps.completesChessMerge(s.id);
        if (freeSlot(ps.hand) < 0 || (mergesOnly && !merges)) return;
        const base = gd.baseIdOf(s.id);
        if (boardFull && !merges && ps.funds - price < reserve) return; // banked (坎诺特)
        sc = buyScore(m, ps, s.id, ctx) - price;
        if (boardFull && !merges) {
          if (!ctx.copies.get(base)) {
            // with a full board a new operator must improve the lineup
            if (!cur) {
              if (!memo || memo.key !== ownKey) memo = { key: ownKey, cur: chooseLineup(m, ps, ctx) };
              cur = memo.cur;
            }
            const gain = lineupGain(m, ps, s.id, ctx, cur);
            if (gain <= 2) {
              const profile = engineProfile(gd, cOf(s.id)), once = profile.gain ? acquisitionGrowthValue(gd, ps, cOf(s.id), m.round) : 0;
              if (m.round >= gd.bossRound || !profile.gain || profile.recurring || once <= Math.max(0, price - (cOf(s.id)?.sellPrice || 1)) + 1.5) return;
              trade = true; sc = once + routeAffinity(gd, ps, cOf(s.id), ctx, m.round) - price;
            }
            sc += Math.min(15, gain * 0.5);
          } else if (gd.isGolden(s.id) || (!ctx.keep.has(base) && !(ctx.pairs < MAX_PAIRS && (chessRec(m, s.id, ps)?.tier ?? 6) <= 3 && countFree(ps.hand) >= 3))) {
            // a second copy of a non-keeper with no bench room for another pair is clutter, sold later at a loss
            return;
          }
        }
        if (!boardFull) sc += 8;
      } else {
        if (fillOnly) return;
        if (!canUseItem(m, ps, { id: s.id })) return;
        if (freeSlot(ps.hand) < 0) return;
        if (ps.funds - price < reserve && !ps.completesItemMerge(s.id)) return;
        const carriers = [...ps.board.values()].filter((p) => p.kind === 'chess' && (p.items || []).length < gd.equipPerChess).length;
        if (!carriers) return;
        sc = 6 + (gd.tierOf(s.id) || 1) * 3 - price + (ps.completesItemMerge(s.id) ? 10 : 0);
      }
      if (sc > bestS) { bestS = sc; best = i; bestMerges = s.kind === 'chess' && ps.completesChessMerge(s.id); bestTrade = trade; }
    });
    // leftover funds are lost at prep end: reroll while a purchase stays affordable (a band that keeps them: down to its
    // reserve — a free refresh is always taken)
    const refreshCost = ps.shop.freeRefreshes > 0 ? 0 : gd.refreshPrice;
    const canRefresh = refreshes < maxRefreshes && ps.funds >= refreshCost + (refreshCost > 0 ? Math.max(minPrice, reserve) : minPrice);
    // a full board buys only what improves it (merge progress, a lineup upgrade), and only when it is worth more than
    // the refreshes its price would pay for (each may show the third copy of a held pair, refreshValue)
    let buy = best >= 0 && bestS >= (boardFull ? BUY_FULL_MIN : 3);
    if (buy && boardFull && canRefresh && !bestMerges) {
      const price = Math.max(1, ps.priceOf(ps.shop.slots[best]));
      if (bestS < refreshValue(m, ps, ctx) * price / Math.max(1, refreshCost)) buy = false;
    }
    if (buy) {
      const tradeId = bestTrade ? ps.shop.slots[best].id : null;
      const before = tradeId ? new Set(ps.allChess().map(p => p.uid)) : null;
      if (!tryDo(() => ps.buy(best))) return;
      if (tradeId) {
        const fresh = ps.allChess().find(p => p.id === tradeId && !before.has(p.uid));
        if (fresh && !gd.isGolden(fresh.id)) tryDo(() => ps.sell(fresh.uid));
      }
      continue;
    }
    if (canRefresh) {
      if (!tryDo(() => ps.refresh())) return;
      refreshes++;
      continue;
    }
    return;
  }
  function cOf(id) { return chessRec(m, id, ps); }
}

/**
 * Choose the deployed set and put it on the best tiles for this round's enemies (planLayout). `final`: the last
 * arrangement of the prep — candidate plans are rehearsed (see createRehearsal) when the match allows it; with `defer`
 * the default plan is placed now and the rehearsal job is returned (the caller runs it and applies `job.best`).
 * @returns {null | ReturnType<typeof createRehearsal>}
 */
export function arrange(m, ps, opts = {}) {
  return runSteps(arrangeSteps(m, ps, opts));
}

/** arrange as a step generator (yields inside the layout planning, see planLayoutSteps). */
export function* arrangeSteps(m, ps, { final = false, defer = false } = {}) {
  const ctx = context(m, ps);
  const chosen = chooseLineup(m, ps, ctx).set;
  const chosenSet = new Set(chosen.map((p) => p.uid));
  // withdraw board chess that are not chosen (to free cap) when the hand has space
  for (const [, p] of [...ps.board]) {
    if (p.kind !== 'chess' || chosenSet.has(p.uid)) continue;
    const idx = freeSlot(ps.hand);
    if (idx >= 0) tryDo(() => ps.move(p.uid, { area: 'hand', idx }));
    else tryDo(() => ps.sell(p.uid));
  }
  yield;
  const plans = [];
  const boss = !m.wave && !!bossWaveOf(m, ps);
  const recordsFor = pieces => {
    const view = lineupView(m, ps, pieces), armor = bossArmor(m, view);
    return p => {
      const c = rangeRec(view, (view.gd || m.gd).chess(p.id));
      if (!c) return c;
      const gd = view.gd || m.gd, stats = estimateCombat(gd, view, c, p, { boss: true, ...armor });
      const b = gd.bond('skillfulShip')?.buffs?.[0]?.bb || {};
      return { ...c, _botDps: stats.dps, _botAspd: stats.aspd, _botAuraWide: (view.layers.skillfulShip || 0) >= (b.power_bond_stack_cnt ?? Infinity),
        _botAuraSource: !!view.bonds.skillfulShip?.active && receivesBond(gd, view, p, 'skillfulShip'),
        _botAuraBonus: (b.base_attack_speed || 0) + (b.attack_speed_per_stack || 0) * (view.layers.skillfulShip || 0) };
    };
  };
  const recOf = boss ? recordsFor(chosen) : null;
  if (final && (m.wave || boss) && m.botRehearsal > 0) {
    for (const v of REHEARSAL_VARIANTS) plans.push(yield* planLayoutSteps(m, ps, chosen, { ...LAYOUT_PARAMS, ...v }));
    if (boss) {
      plans.unshift(yield* planLayoutSteps(m, ps, chosen, LAYOUT_PARAMS, { recOf }));
      const alternate = bossLineupAlternative(m, ps, chosen, ctx);
      if (alternate) {
        const plan = yield* planLayoutSteps(m, ps, alternate, LAYOUT_PARAMS, { recOf: recordsFor(alternate) });
        plan.chosen = alternate;
        plans.splice(1, 0, plan);
      }
    }
  } else {
    plans.push(yield* planLayoutSteps(m, ps, chosen));
  }
  if (final && chosen.some(p => engineProfile(ps.gd || m.gd, (ps.gd || m.gd).chess(p.id)).position)) {
    const growthPlan = yield* improveGrowthLayoutSteps(m, ps, chosen, plans[0]);
    if (m.botRehearsal > 0) plans.splice(1, 0, growthPlan);
    else plans[0] = growthPlan;
  }
  if (defer && plans.length > 1) {
    const job = yield* createRehearsalSteps(m, ps, chosen, plans);
    yield* applyPlanSteps(m, ps, chosen, plans[0]);
    return job;
  }
  const best = plans.length > 1 ? rehearse(m, ps, chosen, plans) : plans[0];
  yield* applyPlanSteps(m, ps, best.chosen || chosen, best);
  return null;
}

/** One owned alternative: keep necessary healing/blocking while testing a damage/utility upgrade. */
export function bossLineupAlternative(m, ps, chosen, ctx = context(m, ps)) {
  const present = new Set(chosen.map(p => p.uid));
  const bench = ps.allChess().filter(p => !present.has(p.uid)).sort((a, b) => pieceValue(m, ps, b, ctx) - pieceValue(m, ps, a, ctx));
  const healers = chosen.filter(p => isHealer(chessRec(m, p.id, ps))).length;
  const blockers = chosen.filter(p => isBlocker(chessRec(m, p.id, ps))).length;
  const weak = chosen.map((p, i) => ({ p, i, value: unitBase(m, p, ctx) })).sort((a, b) => a.value - b.value);
  let best = null, bestScore = -Infinity;
  for (const incoming of bench.slice(0, 3)) for (const out of weak) {
    const a = chessRec(m, incoming.id, ps), b = chessRec(m, out.p.id, ps);
    if (healers === 1 && isHealer(b) && !isHealer(a)) continue;
    if (blockers === 1 && isBlocker(b) && !isBlocker(a)) continue;
    if (freeSlot(ps.hand) < 0) {
      const loc = ps.find(out.p.uid);
      if (ps.find(incoming.uid)?.area !== 'hand' || loc?.area !== 'board') continue;
      const [row, col] = parseKey(loc.key);
      if (!canPlace(ps.deployMap(), placeClass(ps, a), row, col)) continue;
    }
    const trial = chosen.slice(); trial[out.i] = incoming;
    const score = lineupScore(m, ps, trial, ctx);
    if (score > bestScore) { bestScore = score; best = trial; }
  }
  return best;
}

/**
 * Put the chosen pieces on their planned tiles, fill what is still off the board, then place summons. Placed summons go
 * back to their stacks first: they would sit on the plan's tiles (an operator moved onto one swaps it elsewhere), and a
 * 凯瑟琳 device left beside a tile its operator moved away from would face nothing (QA, playtest #6).
 */
function* applyPlanSteps(m, ps, chosen, target) {
  liftTokens(ps);
  const keep = new Set(chosen.map(p => p.uid));
  for (const [key, p] of [...ps.board]) if (p.kind === 'chess' && !keep.has(p.uid)) {
    const idx = freeSlot(ps.hand);
    if (idx >= 0) tryDo(() => ps.move(p.uid, { area: 'hand', idx }));
    else {
      const [row, col] = parseKey(key);
      const incoming = chosen.find(c => ps.find(c.uid)?.area === 'hand'
        && canPlace(ps.deployMap(), placeClass(ps, (ps.gd || m.gd).chess(c.id)), row, col));
      if (incoming) tryDo(() => ps.move(incoming.uid, { area: 'board', row, col }, planDir(target, incoming.uid)));
    }
  }
  // move pieces onto their targets (board → board moves swap; hand → board may swap an occupant back to the hand)
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const p of chosen) {
      const k = target.get(p.uid);
      if (!k) continue;
      const loc = ps.find(p.uid);
      const dir = planDir(target, p.uid);
      if (!loc || (loc.area === 'board' && loc.key === k && pieceDir(loc.piece) === dir)) continue;
      const [r, c] = parseKey(k);
      // onto its own tile: an in-place re-orientation (not a move)
      if (tryDo(() => ps.move(p.uid, { area: 'board', row: r, col: c }, dir)) && loc.key !== k) moved = true;
    }
    if (!moved) break;
  }
  // anything chosen still off the board: the best remaining free tile
  // (the server's g.move decides legality: a refused tile is excluded on the second pass)
  const refused = new Set();
  for (let pass = 0; pass < 2; pass++) {
    const off = chosen.filter((p) => { const loc = ps.find(p.uid); return loc && loc.area !== 'board'; });
    if (!off.length || ps.deployCount >= ps.deployCap) break;
    yield;
    const again = yield* planLayoutSteps(m, ps, off, LAYOUT_PARAMS, { occupied: new Set([...ps.board.keys(), ...refused]) });
    for (const p of off) {
      const k = again.get(p.uid);
      if (!k || ps.deployCount >= ps.deployCap) continue;
      const [r, c] = parseKey(k);
      if (!tryDo(() => ps.move(p.uid, { area: 'board', row: r, col: c }, planDir(again, p.uid)))) refused.add(k);
    }
    if (!refused.size) break;
  }
  yield* placeTokensSteps(m, ps);
}

/** Board summons back to their hand stacks (or a free hand slot). */
function liftTokens(ps) {
  for (const p of [...ps.board.values()]) {
    if (p.kind !== 'token') continue;
    const stack = ps.hand.findIndex((x) => x && x.kind === 'token' && x.ownerUid === p.ownerUid && x.id === p.id);
    const idx = stack >= 0 ? stack : freeSlot(ps.hand);
    if (idx >= 0) tryDo(() => ps.move(p.uid, { area: 'hand', idx }));
  }
}

/**
 * Summons that help the operator on the tile they face (range 1-1: their own tile + the one in front) instead of
 * covering the enemy path: 凯瑟琳's 爬行号·防护单元 (a hand piece since user playtest #6).
 */
const FRONT_SUPPORT_TOKENS = new Set(['token_10041_cathy_catsld']);
/** Device tile offsets around an operator (behind it — enemies come from the gates on the right —, above, below, in front) and the facing that points back at it. */
const SUPPORT_SPOTS = Object.freeze([[0, -1, 'RIGHT'], [1, 0, 'DOWN'], [-1, 0, 'UP'], [0, 1, 'LEFT']]);

/**
 * A tile + direction for a front-support device: next to the most valuable operator no device faces yet (blockers
 * first — they take the hits —, then DPS), pointing at it; null when none is free.
 */
function supportSpot(m, ps, p) {
  const rec = (ps.gd || m.gd).token(p.id);
  if (!rec) return null;
  const map = ps.deployMap();
  const pos = positionClass(rec);
  const faced = new Set();
  for (const [k, q] of ps.board) {
    if (q.kind !== 'token' || !FRONT_SUPPORT_TOKENS.has(q.id)) continue;
    const [r, c] = parseKey(k);
    const [dr, dc] = rotateOffset(0, 1, pieceDir(q));
    faced.add(tileKey(r + dr, c + dc));
  }
  const ops = [...ps.board.entries()].filter(([k, q]) => q.kind === 'chess' && !faced.has(k)).map(([k, q]) => [k, (ps.gd || m.gd).chess(q.id)]).filter(([, c]) => c)
    .sort((a, b) => Number(isBlocker(b[1])) - Number(isBlocker(a[1])) || dpsOf(b[1]) - dpsOf(a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [k] of ops) {
    const [r, c] = parseKey(k);
    for (const [dr, dc, dir] of SUPPORT_SPOTS) {
      const t = tileKey(r + dr, c + dc);
      if (!ps.board.has(t) && canPlace(map, pos, r + dr, c + dc)) return [r + dr, c + dc, dir];
    }
  }
  return null;
}

/** Tiles a summon placement tries before giving up (a refused tile is skipped and the next best one taken). */
const SUMMON_TRIES = 4;

/**
 * Placeable summons from the hand / temp onto the best free tiles (one per stack count). The server's g.move decides
 * legality: a refused tile is excluded and the next best one tried (SUMMON_TRIES).
 */
function* placeTokensSteps(m, ps) {
  for (const p of [...ps.hand, ...ps.temp]) {
    if (!p || p.kind !== 'token') continue;
    for (let n = p.count || 1; n > 0; n--) {
      yield;
      if (FRONT_SUPPORT_TOKENS.has(p.id)) {
        const spot = supportSpot(m, ps, p);
        if (!spot || !tryDo(() => ps.move(p.uid, { area: 'board', row: spot[0], col: spot[1] }, spot[2]))) break;
        continue;
      }
      const refused = new Set();
      let placed = false;
      for (let t = 0; t < SUMMON_TRIES && !placed; t++) {
        const plan = yield* planLayoutSteps(m, ps, [p], LAYOUT_PARAMS, { occupied: new Set([...ps.board.keys(), ...refused]) });
        const k = plan.get(p.uid);
        if (!k) break;
        const [r, c] = parseKey(k);
        if (tryDo(() => ps.move(p.uid, { area: 'board', row: r, col: c }, planDir(plan, p.uid)))) placed = true;
        else refused.add(k);
      }
      if (!placed) break;
    }
  }
}

/** What an item does: the key of its first buff (data/items.json `buffs`, e.g. use_equip_reward_char_chess). */
const itemEffect = (rec) => (rec && Array.isArray(rec.buffs) && rec.buffs[0] && typeof rec.buffs[0].key === 'string' ? rec.buffs[0].key : '');

/** 突变细胞 (buff char_chess_transformation_equip). */
const isMutationCell = (gd, itemId) => itemEffect(gd.item(itemId)) === 'char_chess_transformation_equip';

/**
 * Whom the bot injects with 突变细胞 (after the battle its carrier — deployed or on the bench: every owned carrier's item
 * hooks run — is destroyed and a random operator one tier higher joins the bench, PlayerState.transformChess; the next
 * prep's lineup step deploys it like any owned unit, so a deployed carrier only costs a re-placement): the least
 * valuable normal operator below 6阶 with a free equip slot — never an elite, never one of a merge pair (the merge
 * progress would be lost), nobody already carrying a cell. null: the cell waits in the hand.
 */
export function cellTarget(m, ps, ctx = context(m, ps)) {
  const gd = ps?.gd || m.gd;
  let best = null;
  let bestV = Infinity;
  for (const p of ps.allChess()) {
    if (gd.isGolden(p.id) || gd.tierOf(p.id) >= 6 || (p.items || []).length >= gd.equipPerChess) continue;
    if ((p.items || []).some((it) => isMutationCell(gd, it.id)) || (ctx.copies.get(gd.baseIdOf(p.id)) || 0) >= 2) continue;
    const v = pieceValue(m, ps, p, ctx);
    if (v < bestV || (v === bestV && p.uid < best.uid)) { bestV = v; best = p; }
  }
  return best;
}

/** Whether the bot's own last battle was perfect (no counted leak). */
function lastPerfect(m, ps) {
  const r = m.lastResults && m.lastResults.get(ps.playerId);
  return !!r && r.perfect !== false && !(r.leaked || []).some((l) => l && l.counted !== false);
}

/**
 * The carrier of an item (null = keep it), by what the item does (itemEffect):
 *   信标 (destroys its carrier for a pick of two chess of the same tier): the highest-tier bench single, else the
 *     weakest normal deployed operator;
 *   拟态物质 (a third copy of a pair, else a member of a bond): a pair (highest tier), else a focus member — never one
 *     of 2 copies whose pool is out (the item gives nothing then);
 *   博士投影 (promotes to elite; the normal one at the next round start, the golden one at once): the strongest normal
 *     deployed operator;
 *   突变细胞 (the carrier becomes a random tier + 1 operator after the battle): cellTarget;
 *   随身身份牌 / 简易通讯机 / 寻呼模块 (act on the carrier's bonds): the operator whose bonds matter most (focus first);
 *   funds, 紧急调度券, 人事部文档 …: anyone, one with a free slot first (on a full carrier the item replaces one of its
 *     items, GitHub #263); a bond signature item (requiresBondId): a member of that bond;
 *   other equipment: the strongest deployed damage dealers with a free slot (SURVIVAL items blockers first).
 */
export function itemTarget(m, ps, item, ctx = context(m, ps)) {
  const gd = ps?.gd || m.gd;
  const rec = gd.item(item.id);
  if (!rec) return null;
  const key = itemEffect(rec);
  const value = new Map();
  const val = (p) => { if (!value.has(p.uid)) value.set(p.uid, pieceValue(m, ps, p, ctx)); return value.get(p.uid); };
  const deployed = [...ps.board.values()].filter((p) => p.kind === 'chess');
  const owned = ps.allChess();
  const normal = (p) => !gd.isGolden(p.id);
  const byVal = (list, dir = -1) => list.slice().sort((a, b) => dir * (val(a) - val(b)) || a.uid - b.uid);
  const rel = (p) => { let r = 0; for (const b of pieceBonds(gd, p)) r += b === ctx.focus ? 3 : ctx.subBonds?.includes(b) ? 2 : ps.bonds[b] && ps.bonds[b].active ? 1 : 0; return r; };
  switch (key) {
    case 'use_equip_recruit_new_char_and_give_char_to_player_most_bond': {
      // a bench single of the highest tier (a pick of two of its tier), else the weakest deployed normal operator
      const counts = copyCounts(m, ps);
      const bench = owned.filter((p) => normal(p) && ps.find(p.uid)?.area !== 'board' && (counts.get(gd.baseIdOf(p.id)) || 0) < 2)
        .sort((a, b) => (chessRec(m, b.id, ps)?.tier || 0) - (chessRec(m, a.id, ps)?.tier || 0) || val(a) - val(b) || a.uid - b.uid);
      return bench[0] || byVal(deployed.filter(normal), 1)[0] || null;
    }
    case 'use_equip_reward_char_chess': {
      // with 2 copies owned and none left in the pool the item gives nothing (GitHub #207): such a pair is no carrier
      const counts = copyCounts(m, ps);
      const live = (base) => { const pool = typeof ps.poolOf === 'function' ? ps.poolOf(base) : m.pool; return pool.left(base) > 0 || !pool.has(base); };
      const dead = (p) => (counts.get(gd.baseIdOf(p.id)) || 0) >= 2 && !live(gd.baseIdOf(p.id));
      const pair = owned.filter((p) => normal(p) && !dead(p) && (counts.get(gd.baseIdOf(p.id)) || 0) + 1 >= mergeNeed(m, gd.baseIdOf(p.id)))
        .sort((a, b) => (chessRec(m, b.id, ps)?.tier || 0) - (chessRec(m, a.id, ps)?.tier || 0) || a.uid - b.uid);
      return pair[0] || owned.filter((p) => !dead(p)).sort((a, b) => rel(b) - rel(a) || val(b) - val(a) || a.uid - b.uid)[0] || null;
    }
    // 博士投影: the normal one promotes at the next round start, the golden one (缪尔赛思's R1 item, item merges) at once;
    // both refuse an elite (builtinMeta: BAD_TARGET 'already elite')
    case 'equip_round_start_upgrade_char':
    case 'use_equip_upgrade_char':
      return (deployed.some(normal) ? deployed.filter(normal) : owned.filter(normal)).sort((a,b) => {
        const promotion = p => val(p) + growthValue(gd, ps, gd.chess(gd.goldenIdOf(p.id)), m.round, { acquisition: false, piece: p });
        return promotion(b) - promotion(a) || a.uid - b.uid;
      })[0] || null;
    case 'char_chess_transformation_equip':
      return cellTarget(m, ps, ctx);
    case 'use_equip_reward_char_chess_bond_layer':
    case 'use_equip_reward_char_chess_with_same_bond':
    case 'use_equip_reward_special_goods_char_chess':
      return owned.slice().sort((a, b) => rel(b) - rel(a) || val(b) - val(a) || a.uid - b.uid)[0] || null;
    default:
      break;
  }
  const consume = typeof rec.kind === 'string' && rec.kind.startsWith('consume_on_equip');
  const list = byVal(deployed);
  const free = (p) => (p.items || []).length < gd.equipPerChess;
  // a consumable on a full carrier destroys one of its items (the replace rule, GitHub #263): a carrier with a free slot
  // first — the effect is the same on anyone
  if (consume) return list.find(free) || owned.find(free) || list[0] || owned[0] || null;
  if (rec.requiresBondId) {
    const member = list.find(p => free(p) && receivesBond(gd, ps, p, rec.requiresBondId));
    if (member) return member;
  }
  // damage dealers carry equipment first (healers / non-attackers last); survival items on blockers first
  const dealer = (p) => { const c = chessRec(m, p.id, ps); return c && !isHealer(c) && c.attackKind !== 'none'; };
  const blocker = (p) => isBlocker(chessRec(m, p.id, ps));
  const order = rec.category === 'SURVIVAL'
    ? [...list.filter(blocker), ...list.filter((p) => !blocker(p) && dealer(p)), ...list.filter((p) => !blocker(p) && !dealer(p))]
    : [...list.filter(dealer), ...list.filter((p) => !dealer(p))];
  return order.filter(free).sort((a, b) => {
    if (rec.category === 'SURVIVAL' && blocker(a) !== blocker(b)) return Number(blocker(b)) - Number(blocker(a));
    const ga = equipmentGain(gd, ps, a, item, chessRec(m, a.id, ps));
    const gb = equipmentGain(gd, ps, b, item, chessRec(m, b.id, ps));
    return (val(b) + gb) - (val(a) + ga) || a.uid - b.uid;
  })[0] || null;
}

/** 教鞭 / “神秘顾客”: an Art that adds a bounty to the own next battle (trap_create_self_choice). */
const isBountyArt = (gd, itemId) => { const rec = gd.item(itemId); return !!rec && Array.isArray(rec.buffs) && rec.buffs.some((b) => b && b.key === 'trap_create_self_choice'); };

/**
 * Use an Art: 画卷 copies the operator on its tile (its range is the tile + the one in front) — the most valuable
 * deployed operator, with a free hand slot for the copy; 教鞭 offers a scored personal bounty choice, “神秘顾客” adds a
 * random bounty — only after a perfect battle with LP to spare, else the Art stays in the hand for a later round
 * (destroying 教鞭 gives nothing; a full hand at the prep end: freeHandSlot).
 */
function useArt(m, ps, item, ctx) {
  const rec = m.gd.item(item.id);
  const keys = (rec && Array.isArray(rec.buffs) ? rec.buffs : []).map((b) => b && b.key);
  if (keys.includes('trap_copy_front_char')) {
    if (freeSlot(ps.hand) < 0) return;
    const best = [...ps.board.entries()].filter(([, p]) => p.kind === 'chess').sort((a, b) => pieceValue(m, ps, b[1], ctx) - pieceValue(m, ps, a[1], ctx) || a[1].uid - b[1].uid)[0];
    if (!best) return;
    const [r, c] = parseKey(best[0]);
    tryDo(() => ps.useArt(item.uid, r, c));
    return;
  }
  if (keys.includes('trap_create_self_choice')) {
    if (!lastPerfect(m, ps) || ps.lp < 10) return; // kept
    const [key] = [...ps.board.keys()];
    if (key) {
      const [r, c] = parseKey(key);
      if (tryDo(() => ps.useArt(item.uid, r, c))) m.autoPickPersonalChoice(ps, 'bot');
    }
    return;
  }
  const [key] = [...ps.board.keys()];
  if (key) { const [r, c] = parseKey(key); tryDo(() => ps.useArt(item.uid, r, c)); }
}

export function* equipItemsSteps(m, ps) {
  const gd = ps?.gd || m.gd;
  const tried = new Set();
  let compared = false;
  const duplicates = it => gd.item(it.id)?.mergeable && [...ps.hand, ...ps.temp, ...ps.allChess().flatMap(p => p.items || [])]
    .some(other => other?.kind === 'item' && other.uid !== it.uid && other.id === it.id);
  for (let guard = 0; guard < 12; guard++) {
    const item = [...ps.hand, ...ps.temp].filter(p => p && p.kind === 'item' && canUseItem(m, ps, p) && !tried.has(p.uid))
      .sort((a, b) => Number(!!gd.item(b.id)?.canGiveBond) - Number(!!gd.item(a.id)?.canGiveBond))[0];
    if (!item) break;
    tried.add(item.uid);
    const ctx = context(m, ps);
    const rec = gd.item(item.id);
    if (rec && rec.itemType === 'MAGIC') { useArt(m, ps, item, ctx); continue; }
    const target = itemTarget(m, ps, item, ctx);
    if (!target) continue;
    if (!compared && bossWaveOf(m, ps) && m.botRehearsal > 1 && rec?.kind === 'passive' && rec.category !== 'ECONOMY'
        && itemEffect(rec) !== 'char_chess_transformation_equip' && !duplicates(item)) {
      const pack = [item];
      if (rec.canGiveBond && (target.items || []).length === 0) {
        const partner = [...ps.hand, ...ps.temp].find(p => p?.kind === 'item' && p.uid !== item.uid && !tried.has(p.uid)
          && gd.item(p.id)?.kind === 'passive' && gd.item(p.id)?.giveBondId && !duplicates(p) && canUseItem(m, ps, p));
        if (partner) pack.push(partner);
      }
      const roster = [...ps.board.values()].filter(p => p.kind === 'chess');
      const alternatives = roster.filter(p => p.uid !== target.uid).sort((a, b) =>
        pieceValue(m, ps, b, ctx) + equipmentGain(gd, ps, b, item, chessRec(m, b.id, ps))
        - pieceValue(m, ps, a, ctx) - equipmentGain(gd, ps, a, item, chessRec(m, a.id, ps)));
      const carriers = [target, ...alternatives]
        .filter(p => (p.items || []).length + pack.length <= gd.equipPerChess && !pack.some(it => (p.items || []).some(old => old.id === it.id)))
        .slice(0, m.botRehearsal - 1);
      if (carriers.length) {
        const plans = carriers.map(holder => {
          const plan = new LayoutPlan([...ps.board].filter(([, p]) => p.kind === 'chess').map(([key, p]) => [p.uid, key]));
          for (const p of roster) plan.dirs.set(p.uid, pieceDir(p));
          plan.chosen = roster.map(p => p.uid === holder.uid ? { ...p, items: [...(p.items || []), ...pack] } : p);
          plan.equipmentHolder = holder.uid;
          return plan;
        });
        const keep = new LayoutPlan(plans[0]); keep.dirs = new Map(plans[0].dirs); keep.chosen = roster; keep.equipmentHolder = null;
        plans.push(keep);
        const commit = holder => {
          for (const it of pack) {
            tried.add(it.uid);
            if (holder != null && ps.find(it.uid)?.piece?.kind === 'item') tryDo(() => ps.equip(it.uid, holder));
          }
        };
        const job = yield* createRehearsalSteps(m, ps, roster, plans);
        if (job) {
          compared = true;
          ps._botPendingEquipment = { round: m.round, commit: () => commit(carriers[0].uid) };
          yield { rehearsal: job };
          ps._botPendingEquipment = null;
          commit(job.best.equipmentHolder);
          yield;
          continue;
        }
      }
    }
    tryDo(() => ps.equip(item.uid, target.uid));
    yield;
  }
}

/**
 * Free a hand slot for an item worth keeping (突变细胞): sell the weakest single hand chess, else (on a bot's own seat
 * only — a human's items under AI 托管 are never destroyed to make room, like freeHandSlot) destroy the cheapest other
 * hand item, else sell the weakest hand chess even of a pair. `piece` (in temp): done once the freed slot pulled it in
 * (PlayerState._fillHandFromTemp — resolveTemp asks for the rightmost temp piece, the next one a slot pulls in). false:
 * the hand stays full (summon cards only).
 */
function makeHandRoom(m, ps, piece = null) {
  const room = () => freeSlot(ps.hand) >= 0 || (piece != null && !ps.temp.includes(piece));
  if (room()) return true;
  if (sellWeakestHand(m, ps, { handOnly: true }) && room()) return true;
  const gd = ps?.gd || m.gd;
  const junk = ps.isBot && !ps.autoplay ? ps.hand.filter((p) => p && p.kind === 'item' && !isMutationCell(gd, p.id))
    .sort((a, b) => ((gd.item(a.id) || {}).price || 0) - ((gd.item(b.id) || {}).price || 0) || a.uid - b.uid)[0] : null;
  if (junk && tryDo(() => ps.destroy(junk.uid)) && room()) return true;
  return sellWeakestHand(m, ps, { handOnly: true, keepPairs: false }) && room();
}

/**
 * Empty the temp row before Ready. A freed hand slot pulls the temp pieces in by itself, rightmost first
 * (PlayerState._fillHandFromTemp), so the pieces are decided right → left: the one at hand is always the next a freed
 * slot takes. A chess: the weakest bench single is sold to make room (it may be the temp chess itself), else the temp
 * chess is sold; an item: see below, else destroyed.
 */
function resolveTemp(m, ps) {
  for (let i = ps.temp.length - 1; i >= 0; i--) {
    const p = ps.temp[i];
    if (!p) continue;
    const idx = freeSlot(ps.hand); // (a recompute pulls it in; a state set up without one)
    if (idx >= 0 && tryDo(() => ps.move(p.uid, { area: 'hand', idx }))) continue;
    if (p.kind === 'chess') {
      if (!sellWeakestHand(m, ps)) tryDo(() => ps.sell(p.uid));
    } else if (p.kind === 'item') {
      // 突变细胞 comes back after every transformation (昆图斯's strategy item), and a human's item under AI 托管 is theirs:
      // make room in the hand (sell a bench operator) rather than lose it — only a hand of nothing but items still drops it
      if ((isMutationCell(m.gd, p.id) || ps.autoplay) && makeHandRoom(m, ps, p)) {
        if (!ps.temp.includes(p)) continue;
        const j = freeSlot(ps.hand);
        if (j >= 0 && tryDo(() => ps.move(p.uid, { area: 'hand', idx: j }))) continue;
      }
      tryDo(() => ps.destroy(p.uid));
    }
  }
  // anything left (e.g. sells failed): final sweep — tokens cannot be sold, they are dropped with the temp slot (and
  // come back at the next round start, PlayerState.startRound)
  for (let i = 0; i < ps.temp.length; i++) {
    const p = ps.temp[i];
    if (!p) continue;
    if (p.kind === 'chess') tryDo(() => ps.sell(p.uid));
    else if (p.kind === 'item') tryDo(() => ps.destroy(p.uid));
  }
  if (!ps.tempEmpty) ps.resolveTemp();
}
