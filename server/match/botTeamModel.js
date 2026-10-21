// A cheap, explicitly opt-in distilled normal-team action ranker. Never a win probability.
import {createHash} from 'node:crypto';
import {prepRuleHash,PREP_FEATURES} from './botValueModel.js';
import {SAFE_TEAM_KIND,safeRuleHashFromLegacy,validateSafeTeamShape,safeMeanScore} from './botTeamGuardModel.js';
import {CONTEXT_TEAM_KIND,CONTEXT_TEAM_WORLD,CONTEXT_TEAM_SCOPE,contextTeamRuleHash,validateContextTeamShape,contextMeanScore} from './botTeamContextModel.js';

export const TEAM_MODEL_VERSION=1;
export const TEAM_WORLD='normal-team-v2-spring-ordinary-sourceless';
export const TEAM_SCOPE=Object.freeze({mode:'coop',difficulty:'ABYSS',players:3,seat:0,rounds:[6,8]});
export const TEAM_FEATURES=Object.freeze([...PREP_FEATURES.map(k=>`delta_${k}`),'recurringIncome','nextIncome','combatItem','bondItem',
  'buy','reward','level','refresh','sell','tier','pressureStrength','pressureDamage','pressureSurvival','pressureGrowth','pressureLevel','growthHorizon']);
export function teamRuleHash(gd) {
  return createHash('sha256').update(`${TEAM_MODEL_VERSION}|${TEAM_WORLD}|${prepRuleHash(gd)}`).digest('hex');
}
export function teamRankFeatures(base,after,{action,pressure,round,recurringIncome=0,nextIncome=0,item=null,tier=0}={}) {
  const delta=Object.fromEntries(PREP_FEATURES.map(k=>[k,(after[k]||0)-(base[k]||0)]));
  const features=[...PREP_FEATURES.map(k=>delta[k]),recurringIncome,nextIncome,
    item?.category==='COMBAT'?1:0,item?.giveBondId?1:0,...['buy','reward','level','refresh','sell'].map(t=>action.type===t?1:0),tier/6,
    pressure*delta.strength,pressure*delta.damage,pressure*delta.survival,pressure*delta.growth,pressure*delta.level,
    Math.max(0,14-round)/8*(delta.growth+recurringIncome)];
  if(features.some(v=>!Number.isFinite(v)))throw new Error('TEAM_NONFINITE_FEATURES');
  return features;
}
export function validateTeamModel(model,gd) {
  if(model?.kind===CONTEXT_TEAM_KIND) {
    if(model.world!==CONTEXT_TEAM_WORLD||JSON.stringify(model.scope)!==JSON.stringify(CONTEXT_TEAM_SCOPE))return 'TEAM_MODEL_SCOPE';
    if(model.rules!==contextTeamRuleHash(teamRuleHash(gd)))return 'TEAM_MODEL_RULES';
    return validateContextTeamShape(model);
  }
  if(model?.kind===SAFE_TEAM_KIND) {
    if(model.world!==TEAM_WORLD||JSON.stringify(model.scope)!==JSON.stringify(TEAM_SCOPE))return 'TEAM_MODEL_SCOPE';
    if(model.rules!==safeRuleHashFromLegacy(teamRuleHash(gd)))return 'TEAM_MODEL_RULES';
    return validateSafeTeamShape(model);
  }
  if(!model||model.version!==TEAM_MODEL_VERSION||model.kind!=='linear-team-prep-ranker')return 'TEAM_MODEL_SCHEMA';
  if(model.world!==TEAM_WORLD||JSON.stringify(model.scope)!==JSON.stringify(TEAM_SCOPE))return 'TEAM_MODEL_SCOPE';
  if(model.rules!==teamRuleHash(gd))return 'TEAM_MODEL_RULES';
  if(JSON.stringify(model.features)!==JSON.stringify(TEAM_FEATURES))return 'TEAM_MODEL_FEATURES';
  if(['weights','mean','scale'].some(k=>!Array.isArray(model[k])||model[k].length!==TEAM_FEATURES.length||model[k].some(v=>!Number.isFinite(v))))return 'TEAM_MODEL_WEIGHTS';
  if(model.weights.some(v=>Math.abs(v)>50)||model.scale.some(v=>v<1e-6)||model.margin!==.2)return 'TEAM_MODEL_WEIGHTS';
  return null;
}
export function teamRankScore(features,model) {
  if(model.kind===CONTEXT_TEAM_KIND)return contextMeanScore(features,model);
  if(model.kind===SAFE_TEAM_KIND)return safeMeanScore(features,model);
  if(features.length!==TEAM_FEATURES.length||features.some(v=>!Number.isFinite(v)))throw new Error('TEAM_NONFINITE_FEATURES');
  return features.reduce((v,x,i)=>v+Math.max(-8,Math.min(8,(x-model.mean[i])/model.scale[i]))*model.weights[i],0);
}
export function teamEligible(m,ps) {
  const scope=m.botTeamModel?.kind===CONTEXT_TEAM_KIND?CONTEXT_TEAM_SCOPE:TEAM_SCOPE;
  return m.mode==='coop'&&m.difficulty==='ABYSS'&&m.order.length===3&&ps.seat===0&&scope.rounds.includes(m.round)
    &&m.order.every(p=>p.isBot&&!p.autoplay)&&!m.alivePlayers().some(p=>p.ready)&&!m._botPlanningBranch;
}
