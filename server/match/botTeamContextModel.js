// Version 3: known-action context interactions and a three-normal-round teacher. Opt-in only.
import {createHash} from 'node:crypto';
import {SAFE_TEAM_FEATURES,SAFE_TEAM_GUARD,safeFeaturesFromLegacy} from './botTeamGuardModel.js';
import {basePositionClass} from './board.js';

export const CONTEXT_TEAM_VERSION=3;
export const CONTEXT_TEAM_KIND='context-team-prep-ranker';
export const CONTEXT_TEAM_WORLD='normal-team-context-three-round-v1';
export const CONTEXT_TEAM_SCOPE=Object.freeze({mode:'coop',difficulty:'ABYSS',players:3,seat:0,rounds:[6,8,11]});
export const CONTEXT_METRICS=Object.freeze(['strength','damage','fill','healers','blockers','air','layerExposure','readyEngines','level','funds','upgradeReach']);
export const CONTEXT_ROOTS=Object.freeze(['round','lp','funds','level','upgradeCost','levelGap','strength','damage','fill','healers','blockers','air',
  'layerExposure','readyEngines','teamAlive','teamMinLp','teamMinLevel','teamMinValue','teamRoleGaps']);
export const CONTEXT_TEAM_FEATURES=Object.freeze([...SAFE_TEAM_FEATURES,...CONTEXT_ROOTS.map(k=>'root_'+k),
  ...CONTEXT_METRICS.map(k=>'contextDelta_'+k),'riskStrength','riskDamage','riskHealers','riskBlockers','riskAir',
  'teamRiskStrength','teamRiskGrowth','buyLevelGap','levelLevelGap','buyLowFunds','levelCheap','blocksUpgrade','opensUpgrade',
  'growthRecipients','engineHorizon','layerRecipients']);
export const contextTeamRuleHash=rules=>createHash('sha256').update(`team-context-v3|${CONTEXT_TEAM_WORLD}|horizon=3|explicit-level|${rules}`).digest('hex');
export const contextGuard=SAFE_TEAM_GUARD;
const bounded=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));

/** Public board roles; no player state, funds, shop or private loadout enters this function. */
export function publicArmySummary(gd,units) {
  const ops=units.filter(u=>u.kind==='op'),r={units:ops.length,value:0,healers:0,blockers:0,air:0};
  for(const u of ops) {
    const c=gd.chess(u.defId);if(!c)continue;
    const heal=c.dmgType==='heal'||c.attackKind==='heal';
    r.value+=(c.tier||1)*(u.golden?gd.goldenCopies:1);
    if(heal)r.healers++;
    if(basePositionClass(c)==='melee'&&(c.stats?.blockCnt??1)>0&&c.attackKind!=='none')r.blockers++;
    if(c.canHitFly&&!heal&&c.attackKind!=='none')r.air++;
  }
  return r;
}

export function contextPublicTeammates(m,ps) {
  return m.publicView().players.filter(p=>p.playerId!==ps.playerId).map(p=>({playerId:p.playerId,alive:p.alive,lp:p.lp,shopLevel:p.shopLevel,
    bandId:p.bandId,bonds:p.bonds,board:p.alive?m._prepBoardUnits(m.players.get(p.playerId)).map(u=>({
      uid:u.uid,kind:u.kind,defId:u.defId,golden:u.golden,x:u.x,y:u.y,dir:u.dir,items:u.items||[]})):[]}));
}

export function contextTeamFeatures(raw,base,after,team,action) {
  const roots={...base,...team},risk=1-bounded(base.lp),teamRisk=1-bounded(team.teamMinLp);
  const d=Object.fromEntries(CONTEXT_METRICS.map(k=>[k,after[k]-base[k]]));
  const buy=Number(action.type==='buy'||action.type==='reward'),level=Number(action.type==='level'),horizon=Math.max(0,1-base.round);
  const xs=[...safeFeaturesFromLegacy(raw,action.type),...CONTEXT_ROOTS.map(k=>roots[k]),...CONTEXT_METRICS.map(k=>d[k]),
    risk*d.strength,risk*d.damage,(1-bounded(base.healers))*d.healers,(1-bounded(base.blockers))*d.blockers,(1-bounded(base.air))*d.air,
    teamRisk*d.strength,teamRisk*raw[2],buy*base.levelGap,level*base.levelGap,buy*(1-bounded(base.funds)),level*(1-bounded(base.upgradeCost)),
    buy*Number(base.upgradeReach>0&&after.upgradeReach<=0),Number(base.upgradeReach<=0&&after.upgradeReach>0),
    raw[2]*base.layerExposure,d.readyEngines*horizon,d.layerExposure*base.fill];
  if(xs.length!==CONTEXT_TEAM_FEATURES.length||xs.some(x=>!Number.isFinite(x)))throw new Error('TEAM_CONTEXT_NONFINITE');
  return xs;
}

/** Same list online and offline. Ensure an affordable upgrade survives the local first-action shortlist. */
export function contextTeamCandidates(local,legal) {
  const groups=[{first:'stop::',action:{type:'stop'}},...local.choices.filter(c=>c.first!=='stop::').slice(0,2)
    .map(c=>({first:c.first,action:c.paths[0][0]}))];
  if(legal.some(a=>a.type==='level')&&!groups.some(c=>c.action.type==='level'))groups.push({first:'level::',action:{type:'level'}});
  return groups;
}
export function contextMemberScore(xs,member) {
  if(xs?.length!==CONTEXT_TEAM_FEATURES.length||xs.some(x=>!Number.isFinite(x)))throw new Error('TEAM_CONTEXT_NONFINITE');
  return xs.reduce((s,x,i)=>s+Math.max(-8,Math.min(8,(x-member.mean[i])/member.scale[i]))*member.weights[i],0);
}
export const contextMeanScore=(xs,model)=>model.members.reduce((s,m)=>s+contextMemberScore(xs,m),0)/model.members.length;
export function validateContextTeamShape(model) {
  const n=CONTEXT_TEAM_FEATURES.length,valid=(xs,check=()=>true)=>Array.isArray(xs)&&xs.length===n&&xs.every(x=>Number.isFinite(x)&&check(x));
  if(model.version!==3||model.kind!==CONTEXT_TEAM_KIND||JSON.stringify(model.features)!==JSON.stringify(CONTEXT_TEAM_FEATURES))return 'TEAM_MODEL_SCHEMA';
  if(JSON.stringify(model.guard)!==JSON.stringify(contextGuard)||model.members?.length!==8)return 'TEAM_MODEL_GUARD';
  if(model.members.some(m=>!valid(m.weights,x=>Math.abs(x)<=50)||!valid(m.mean)||!valid(m.scale,x=>x>=1e-6)))return 'TEAM_MODEL_WEIGHTS';
  const c=model.coverage;if(!c||!valid(c.mean)||!valid(c.scale,x=>x>=1e-6)||!valid(c.min)||!valid(c.max)||c.min.some((x,i)=>x>c.max[i]))return 'TEAM_MODEL_COVERAGE';
  if(!model.support||['buy','reward','level','refresh','sell'].some(k=>!Number.isInteger(model.support[k])||model.support[k]<0))return 'TEAM_MODEL_COVERAGE';
  return null;
}
export function selectContextTeamCandidate(candidates,model) {
  const vector=c=>c.features||c.rankFeatures,stop=candidates.find(c=>c.first==='stop::');if(!stop)throw new Error('TEAM_STOP_REQUIRED');
  const scores=model.members.map(m=>contextMemberScore(vector(stop),m)),reviews=[];
  for(const c of candidates.filter(c=>c!==stop)) {
    const xs=vector(c),margins=model.members.map((m,i)=>contextMemberScore(xs,m)-scores[i]),mean=margins.reduce((s,x)=>s+x,0)/8;
    const changed=[0,1,2,4,5,6,7,8,9,10,11,...CONTEXT_METRICS.map((_,i)=>SAFE_TEAM_FEATURES.length+CONTEXT_ROOTS.length+i)]
      .some(i=>Math.abs(xs[i])>1e-8);
    const uncovered=xs.some((x,i)=>model.coverage.max[i]-model.coverage.min[i]<1e-9?Math.abs(x-model.coverage.min[i])>1e-9
      :Math.abs((x-model.coverage.mean[i])/model.coverage.scale[i])>model.guard.maxZ);
    const type=c.action?.type||c.first.split(':')[0],agreement=margins.filter(x=>x>model.guard.margin).length;
    const reason=!changed?'no-visible-effect':(model.support[type]||0)<model.guard.minSupportSeeds?'insufficient-seed-support':uncovered?'outside-training-coverage'
      :mean<=model.guard.margin||agreement<model.guard.agreement||Math.min(...margins)<model.guard.minMargin?'ensemble-disagreement':null;
    reviews.push({first:c.first,margin:mean,agreement,minMargin:Math.min(...margins),reason});
  }
  const best=reviews.filter(r=>!r.reason).sort((a,b)=>b.margin-a.margin||a.first.localeCompare(b.first))[0];
  return {selected:best?.first||'stop::',reviews};
}
