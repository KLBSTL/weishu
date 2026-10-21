// Experimental abstention rules for a version-2 ensemble; no claim of guaranteed safe outcomes.
import {createHash} from 'node:crypto';
import {PREP_FEATURES} from './botValueModel.js';
export const SAFE_TEAM_VERSION=2;
export const SAFE_TEAM_KIND='guarded-team-prep-ranker';
export const SAFE_TEAM_FEATURES=Object.freeze([...PREP_FEATURES.map(k=>`delta_${k}`),'recurringIncome','nextIncome','combatItem','bondItem',
  'buy','reward','level','refresh','sell','purchaseTier','pressureStrength','pressureDamage','pressureSurvival','pressureGrowth','pressureLevel','growthHorizon']);
export const SAFE_TEAM_GUARD=Object.freeze({members:8,agreement:6,margin:.2,minMargin:-.2,minSupportSeeds:2,maxZ:4});
export const safeRuleHashFromLegacy=rules=>createHash('sha256').update(`team-guard-v2|${rules}`).digest('hex');
export function safeFeaturesFromLegacy(features,type) {
  const xs=[...features];if(!['buy','reward'].includes(type))xs[SAFE_TEAM_FEATURES.indexOf('purchaseTier')]=0;return xs;
}
const vector=c=>c.features||c.rankFeatures;
export function safeMemberScore(xs,member) {
  if(xs?.length!==SAFE_TEAM_FEATURES.length||xs.some(v=>!Number.isFinite(v)))throw new Error('TEAM_NONFINITE_FEATURES');
  return xs.reduce((s,x,i)=>s+Math.max(-8,Math.min(8,(x-member.mean[i])/member.scale[i]))*member.weights[i],0);
}
export const safeMeanScore=(xs,model)=>model.members.reduce((s,m)=>s+safeMemberScore(xs,m),0)/model.members.length;
export function validateSafeTeamShape(model) {
  const n=SAFE_TEAM_FEATURES.length,valid=(xs,check=()=>true)=>Array.isArray(xs)&&xs.length===n&&xs.every(x=>Number.isFinite(x)&&check(x));
  if(model.version!==SAFE_TEAM_VERSION||model.kind!==SAFE_TEAM_KIND||JSON.stringify(model.features)!==JSON.stringify(SAFE_TEAM_FEATURES))return 'TEAM_MODEL_SCHEMA';
  if(JSON.stringify(model.guard)!==JSON.stringify(SAFE_TEAM_GUARD)||!Array.isArray(model.members)||model.members.length!==8)return 'TEAM_MODEL_GUARD';
  if(model.members.some(m=>!valid(m.weights,x=>Math.abs(x)<=50)||!valid(m.mean)||!valid(m.scale,x=>x>=1e-6)))return 'TEAM_MODEL_WEIGHTS';
  const c=model.coverage;if(!c||!valid(c.mean)||!valid(c.scale,x=>x>=1e-6)||!valid(c.min)||!valid(c.max)||c.min.some((x,i)=>x>c.max[i]))return 'TEAM_MODEL_COVERAGE';
  if(!model.support||['buy','reward','level','refresh','sell'].some(k=>!Number.isInteger(model.support[k])||model.support[k]<0))return 'TEAM_MODEL_COVERAGE';
  return null;
}
export function selectSafeTeamCandidate(candidates,model) {
  const stop=candidates.find(c=>c.first==='stop::');if(!stop)throw new Error('TEAM_STOP_REQUIRED');
  const stopScores=model.members.map(m=>safeMemberScore(vector(stop),m)),reviews=[];
  for(const c of candidates.filter(c=>c!==stop)) {
    const xs=vector(c),margins=model.members.map((m,i)=>safeMemberScore(xs,m)-stopScores[i]);
    const mean=margins.reduce((s,x)=>s+x,0)/margins.length,type=c.action?.type||c.first.split(':')[0];
    const changed=[0,1,2,4,5,6,7,8,9,10,11].some(i=>Math.abs(xs[i])>1e-8);
    const uncovered=xs.some((x,i)=>model.coverage.max[i]-model.coverage.min[i]<1e-9?Math.abs(x-model.coverage.min[i])>1e-9
      :Math.abs((x-model.coverage.mean[i])/model.coverage.scale[i])>model.guard.maxZ);
    const reason=!changed?'no-visible-effect':(model.support[type]||0)<model.guard.minSupportSeeds?'insufficient-seed-support':uncovered?'outside-training-coverage'
      :mean<=model.guard.margin||margins.filter(x=>x>model.guard.margin).length<model.guard.agreement||Math.min(...margins)<model.guard.minMargin?'ensemble-disagreement':null;
    reviews.push({first:c.first,margin:mean,agreement:margins.filter(x=>x>model.guard.margin).length,minMargin:Math.min(...margins),reason});
  }
  const accepted=reviews.filter(r=>!r.reason).sort((a,b)=>b.margin-a.margin||a.first.localeCompare(b.first));
  return {selected:accepted[0]?.first||'stop::',reviews};
}
