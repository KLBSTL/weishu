#!/usr/bin/env node
// Paired outcome benchmark. Both variants use identical current game data and content.
// Usage: node tools/ai-compare.mjs --output outputs/ai-compare [--seeds 50 --seed 1001 --jobs 4]
// Baseline defaults to the last published October 13 AI, including its own strategy module.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i += 2) {
  assert.ok(args[i].startsWith('--') && args[i + 1], 'options need values');
  opt[args[i].slice(2)] = args[i + 1];
}
const n = Number(opt.seeds ?? 50), seed = Number(opt.seed ?? 1001), jobs = Number(opt.jobs ?? 4);
assert.ok(Number.isInteger(n) && n > 0 && n <= 1000);
assert.ok(Number.isInteger(seed) && Number.isInteger(jobs) && jobs >= 1 && jobs <= 16);
const baseline = opt.baseline ?? 'df2f2edc03ec9361652ceb489a46bb6b842f0ff9';
assert.ok(!(opt.baseline && opt['baseline-dir']), 'choose a commit or a local baseline, not both');
const baselineDir = opt['baseline-dir'] ? path.resolve(root, opt['baseline-dir']) : null;
const commit = baselineDir ? null : execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const sourceLabel = baselineDir ? 'local source snapshot' : commit;
const out = path.resolve(root, opt.output ?? 'outputs/ai-compare');
fs.mkdirSync(out, { recursive: true });
const legacy = fs.mkdtempSync(path.join(out, 'baseline-runtime-'));
for (const folder of ['server', 'shared', 'data', 'tools', 'packs']) {
  if (fs.existsSync(path.join(root, folder))) fs.cpSync(path.join(root, folder), path.join(legacy, folder), { recursive: true });
}
fs.copyFileSync(path.join(root, 'package.json'), path.join(legacy, 'package.json'));
const files = ['server/match/bot.js', 'server/match/player/round.js', 'server/match/match/prep.js', 'server/match/audit.js'];
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const versions = {};
for (const file of files) {
  const old = baselineDir ? fs.readFileSync(path.join(baselineDir, file)) : execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(legacy, file), old);
  versions[file] = { baseline: sha(old), current: sha(fs.readFileSync(path.join(root, file))) };
}
const strategy = 'server/match/botStrategy.js';
let oldStrategy = null;
try { oldStrategy = baselineDir ? fs.readFileSync(path.join(baselineDir, strategy)) : execFileSync('git', ['show', `${commit}:${strategy}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4 * 1024 * 1024 }); }
catch { assert.equal(commit, '021eca7b4fe7f2df659ba5e1d34c4f3bb788555e', 'baseline must contain its strategy module'); }
if (oldStrategy) fs.writeFileSync(path.join(legacy, strategy), oldStrategy);
versions[strategy] = { baseline: oldStrategy ? sha(oldStrategy) : null, current: sha(fs.readFileSync(path.join(root, strategy))) };
for (const file of ['server/match/botGrowth.js','server/match/botPlans.js','server/match/botEnvironment.js','server/match/botSearch.js','server/match/botValueModel.js']) {
  const oldFile = baselineDir ? path.join(baselineDir,file) : null;
  if (oldFile && fs.existsSync(oldFile)) fs.copyFileSync(oldFile,path.join(legacy,file));
  versions[file] = { baseline: oldFile && fs.existsSync(oldFile) ? sha(fs.readFileSync(oldFile)) : null,
    current: fs.existsSync(path.join(root,file)) ? sha(fs.readFileSync(path.join(root,file))) : null };
}
const data = Object.fromEntries(fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.json'))
  .map(file => [file, sha(fs.readFileSync(path.join(root, 'data', file)))]));
const command = ['tools/botbench.mjs', '--configs', 'coop3:ABYSS', '--seed', String(seed), '--seeds', String(n),
  '--jobs', String(jobs), '--rehearsal', '3'];
const commands = Object.fromEntries(['baseline','current'].map(name => {
  const args = [...command], planner = name === 'baseline' ? opt['baseline-planner'] || opt.planner : opt.planner;
  const model = name === 'baseline' ? opt['baseline-model'] || (planner === 'off' ? null : opt['planner-model']) : opt['planner-model'];
  if (planner) args.push('--planner', planner);
  if (model) args.push('--planner-model', path.resolve(root,model));
  return [name,args];
}));
const manifest = { baselineCommit: commit, ...(baselineDir ? { baselineSource: 'local source snapshot', baselineDir } : {}), config: 'coop3:ABYSS', seats: '3 AI, no human autoplay',
  seed, samplesPerVersion: n, jobs, rehearsal: 3, versions, data, command, commands,
  ...(opt['planner-model'] ? { modelHash: sha(fs.readFileSync(path.resolve(root,opt['planner-model']))) } : {}),
  ...(opt['baseline-model'] ? { baselineModelHash: sha(fs.readFileSync(path.resolve(root,opt['baseline-model']))) } : {}),
  scope: 'The frozen bot runtime and its strategy module are restored for baseline; new strategy helper hashes are recorded. An old baseline does not import the new helpers. All other game content/data and observer tools are identical.' };
manifest.harness = Object.fromEntries(['tools/ai-compare.mjs','tools/botbench.mjs','tools/botbench-positioning.mjs']
  .filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [name, cwd] of [['baseline', legacy], ['current', root]]) {
  process.stdout.write(`Running ${name}: ${n} paired-seed matches, coop3:ABYSS\n`);
  const run = spawnSync(process.execPath, [...commands[name], '--json', path.join(out, `${name}.json`)],
    { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  fs.writeFileSync(path.join(out, `${name}.log`), (run.stdout ?? '') + (run.stderr ?? ''));
  assert.equal(run.status, 0, `${name} failed: see ${name}.log`);
  process.stdout.write(`${name} completed\n`);
}
const before = JSON.parse(fs.readFileSync(path.join(out, 'baseline.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(out, 'current.json'), 'utf8'));
assert.equal(before.length, n); assert.equal(after.length, n);
const pairs = before.map((a, i) => {
  const b = after[i];
  for (const key of ['config', 'seed', 'stageId', 'bossId', 'bossRound']) assert.equal(a[key], b[key], `pair ${i} ${key}`);
  assert.equal(a.errors, 0, `baseline seed ${a.seed} errors`); assert.equal(b.errors, 0, `current seed ${b.seed} errors`);
  return { seed: a.seed, stageId: a.stageId, bossId: a.bossId, before: a.victory, after: b.victory,
    beforeRounds: a.roundsPassed, afterRounds: b.roundsPassed };
});
// Wilson score interval for each observed win rate, not a promise of the true rate.
const wilson = (wins, count) => {
  const z = 1.959963984540054, p = wins / count, d = 1 + z * z / count;
  const middle = (p + z * z / (2 * count)) / d;
  const radius = z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count) / d;
  return [Math.max(0, middle - radius), Math.min(1, middle + radius)];
};
const stats = rows => {
  const wins = rows.filter(r => r.victory).length;
  return { n: rows.length, wins, rate: wins / rows.length, winRate95: wilson(wins, rows.length),
    bossReached: rows.filter(r => r.maxRoundStarted >= r.bossRound).length,
    bossCleared: rows.filter(r => r.roundsPassed >= r.bossRound).length,
    hiddenReached: rows.filter(r => r.hidden).length,
    hiddenCleared: rows.filter(r => r.hiddenCleared).length,
    averageRounds: rows.reduce((s, r) => s + r.roundsPassed, 0) / rows.length,
    averageLp: rows.reduce((s, r) => s + r.lpLeft, 0) / rows.length };
};
const bossDamage = row => {
  const fights = row.bossFights?.filter(f => f.kind === 'boss' && f.round === row.bossRound);
  if (fights?.length) return fights.reduce((s, f) => s + Object.values(f.players).reduce((a, p) => a + (p.bossDamage || 0), 0), 0);
  return null;
};
const commonBoss = before.map((a, i) => [a, after[i]]).filter(([a, b]) => a.maxRoundStarted >= a.bossRound && b.maxRoundStarted >= b.bossRound);
for (const [a, b] of commonBoss) assert.ok(bossDamage(a) != null && bossDamage(b) != null, `missing formal boss record: ${a.seed}`);
const layersAt = (rows, round) => {
  const alive = rows.flatMap(r => r.rounds.filter(x => x.round === round).flatMap(x => Object.values(x.players).filter(p => p.alive)));
  const values = alive.map(p => p.layers).sort((a, b) => a - b);
  return { aliveSeats: alive.length, mean: alive.length ? values.reduce((s, n) => s + n, 0) / alive.length : null,
    median: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null,
    growthUnits: alive.length ? alive.reduce((s, p) => s + (p.growthUnits || 0), 0) / alive.length : null };
};
const summary = { baseline: stats(before), current: stats(after),
  paired: { bothWin: pairs.filter(p => p.before && p.after).length, baselineOnly: pairs.filter(p => p.before && !p.after).length,
    currentOnly: pairs.filter(p => !p.before && p.after).length, bothLose: pairs.filter(p => !p.before && !p.after).length }, pairs };
const boardStats = (rows,round=null) => {
  const seats=rows.flatMap(r=>r.rounds.filter(x=>round==null||x.round===round).flatMap(x=>Object.values(x.players)))
    .filter(p=>p.positioning&&(round==null||p.alive));
  const sum=key=>seats.reduce((s,p)=>s+(p.positioning[key]||0),0);
  const specialties=seats.filter(p=>p.positioning.specialtyMembers!=null);
  return {observations:seats.length,meanLevel:seats.length?seats.reduce((s,p)=>s+p.level,0)/seats.length:null,
    specialtyObservations:specialties.length,meanSpecialtyMembers:specialties.length?specialties.reduce((s,p)=>s+p.positioning.specialtyMembers,0)/specialties.length:null,
    attackers:sum('attackers'),wrongFacing:sum('wrongFacing'),unreachableAttackers:sum('unreachableAttackers'),
    healers:sum('healers'),uncoveredHealers:sum('uncoveredHealers'),exposedHealers:sum('exposedHealers')};
};
summary.boardQuality={baseline:boardStats(before),current:boardStats(after)};
summary.progression=Object.fromEntries([3,5,8,11,14].map(round=>[round,{baseline:boardStats(before,round),current:boardStats(after,round)}]));
summary.layerRounds = Object.fromEntries([5, 8, 11, 14].map(round => [round, { baseline: layersAt(before, round), current: layersAt(after, round) }]));
summary.earnedLayers = { baseline: before.reduce((s, r) => s + Object.values(r.layerGains || {}).flatMap(Object.values).reduce((a, n) => a + n, 0), 0),
  current: after.reduce((s, r) => s + Object.values(r.layerGains || {}).flatMap(Object.values).reduce((a, n) => a + n, 0), 0) };
summary.commonBoss = { samples: commonBoss.length, baselineMeanDamage: commonBoss.length ? commonBoss.reduce((s, [a]) => s + bossDamage(a), 0) / commonBoss.length : null,
  currentMeanDamage: commonBoss.length ? commonBoss.reduce((s, [, b]) => s + bossDamage(b), 0) / commonBoss.length : null,
  pairs: commonBoss.map(([a, b]) => ({ seed: a.seed, bossId: a.bossId, baselineDamage: bossDamage(a), currentDamage: bossDamage(b) })) };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const pct = n => (100 * n).toFixed(1) + '%', interval = s => s.winRate95.map(pct).join('–');
const a = summary.baseline, b = summary.current;
const fixed = n => n == null ? '—' : n.toFixed(2);
const layerRows = Object.entries(summary.layerRounds).map(([round, { baseline: a, current: b }]) =>
  `| R${round} | ${a.aliveSeats} | ${b.aliveSeats} | ${fixed(a.mean)} | ${fixed(b.mean)} | ${fixed(a.median)} | ${fixed(b.median)} | ${fixed(a.growthUnits)} | ${fixed(b.growthUnits)} |`).join('\n');
const progressionRows=Object.entries(summary.progression).map(([round,{baseline:a,current:b}])=>
  `| R${round} | ${a.observations}/${b.observations} | ${fixed(a.meanLevel)} / ${fixed(b.meanLevel)} | ${fixed(a.meanSpecialtyMembers)} / ${fixed(b.meanSpecialtyMembers)} |`).join('\n');
const quality=summary.boardQuality;
const report = `# 三AI终极模拟配对测试\n\n两版各${n}局，种子${seed}–${seed + n - 1}，共${n * 2}局。对照策略来源：${sourceLabel}；两版其余游戏代码与数据一致，默认3候选。\n\n`
  + `| 指标 | 原版 | 新版 |\n| --- | ---: | ---: |\n| 通关 | ${a.wins}/${n} | ${b.wins}/${n} |\n| 通关率 | ${pct(a.rate)} | ${pct(b.rate)} |\n| 95%区间 | ${interval(a)} | ${interval(b)} |\n| 到Boss | ${a.bossReached}/${n} | ${b.bossReached}/${n} |\n| 通过Boss | ${a.bossCleared}/${n} | ${b.bossCleared}/${n} |\n| 到隐秘 | ${a.hiddenReached}/${n} | ${b.hiddenReached}/${n} |\n| 平均通过回合 | ${a.averageRounds.toFixed(2)} | ${b.averageRounds.toFixed(2)} |\n| 平均剩余LP | ${a.averageLp.toFixed(2)} | ${b.averageLp.toFixed(2)} |\n\n`
  + `配对结果：皆胜${summary.paired.bothWin}、仅原版胜${summary.paired.baselineOnly}、仅新版胜${summary.paired.currentOnly}、皆败${summary.paired.bothLose}。全部地图/Boss逐种子一致，运行错误0。\n\n`
  + `| 回合 | 存活席位 原/新 | 调度等级均值 原/新 | 分队核心成员均值 原/新 |\n| --- | ---: | ---: | ---: |\n${progressionRows}\n\n`
  + `全部已记录准备期：对照/新版分别${quality.baseline.observations}/${quality.current.observations}个席位回合；可纠正空朝向${quality.baseline.wrongFacing}/${quality.current.wrongFacing}次，无法覆盖任何路线的攻击者${quality.baseline.unreachableAttackers}/${quality.current.unreachableAttackers}次；医疗位于阻挡线之前${quality.baseline.exposedHealers}/${quality.current.exposedHealers}次，医疗总观察数${quality.baseline.healers}/${quality.current.healers}次。朝向与医疗风险基于公开路线和基础攻击/治疗范围，是位置诊断，不等同于实际技能输出或死亡原因；更长存活会改变总观察次数，不能直接比较原始次数。\n\n`
  + `正式事件累计新增层数：原版${summary.earnedLayers.baseline}，新版${summary.earnedLayers.current}。按onLayers的实际to−from累计，已包含上限裁剪；存活更久也会增加这一总量。\n\n`
  + `| 回合 | 原版存活席位 | 新版存活席位 | 原版活跃层数均值 | 新版均值 | 原版中位数 | 新版中位数 | 原版成长棋子均值 | 新版均值 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${layerRows}\n\n`
  + `层数与成长棋子均值只统计对应回合存活席位，每版最多${n * 3}个席位；不同存活样本有选择偏差，不能单独证明成长效率提升。活跃层数是当时激活盟约的存储层数之和；成长棋子仅按已知特质标记计数，不代表实际成功触发次数。\n\n`
  + `两版共同到Boss的${summary.commonBoss.samples}对种子：每局实际Boss池伤害均值${fixed(summary.commonBoss.baselineMeanDamage)}→${fixed(summary.commonBoss.currentMeanDamage)}。使用正式结果，含队伍存活期和击杀后提前结束的影响，不等同于固定时间DPS；逐种子见summary.json的commonBoss。\n\n`
  + `通关使用正式Match的victory；Boss通过使用roundsPassed≥bossRound；隐秘到达不是隐秘通关。并行${jobs}工作线程仅用于收集结果，未据此比较服务器决策延迟。策略差异会改变后续随机消耗，配对种子并不保证两版遭遇相同商店序列。未孤立分析补助、策略及分队偏好的各自贡献。\n\n`
  + `原始结果baseline.json/current.json，逐种子配对与统计summary.json，来源与数据哈希manifest.json。\n`;
fs.writeFileSync(path.join(out, 'report.md'), report);
process.stdout.write(report);
