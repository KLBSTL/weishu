#!/usr/bin/env node
// Paired outcome benchmark. Both variants use identical current game data and content.
// Usage: node tools/ai-compare.mjs --output outputs/ai-compare [--seeds 50 --seed 1001 --jobs 4]
// Baseline is the published AI before the October 13 enhancements, not subsidy-disabled new AI.
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
const baseline = opt.baseline ?? '021eca7b4fe7f2df659ba5e1d34c4f3bb788555e';
const commit = execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
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
  const old = execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(legacy, file), old);
  versions[file] = { baseline: sha(old), current: sha(fs.readFileSync(path.join(root, file))) };
}
versions['server/match/botStrategy.js'] = { baseline: null, current: sha(fs.readFileSync(path.join(root, 'server/match/botStrategy.js'))) };
const data = Object.fromEntries(fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.json'))
  .map(file => [file, sha(fs.readFileSync(path.join(root, 'data', file)))]));
const command = ['tools/botbench.mjs', '--configs', 'coop3:ABYSS', '--seed', String(seed), '--seeds', String(n),
  '--jobs', String(jobs), '--rehearsal', '3'];
const manifest = { baselineCommit: commit, config: 'coop3:ABYSS', seats: '3 AI, no human autoplay',
  seed, samplesPerVersion: n, jobs, rehearsal: 3, versions, data, command,
  scope: 'Only the four listed legacy runtime files are restored; all other game content/data are current in both variants.' };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [name, cwd] of [['baseline', legacy], ['current', root]]) {
  process.stdout.write(`Running ${name}: ${n} paired-seed matches, coop3:ABYSS\n`);
  const run = spawnSync(process.execPath, [...command, '--json', path.join(out, `${name}.json`)],
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
const summary = { baseline: stats(before), current: stats(after),
  paired: { bothWin: pairs.filter(p => p.before && p.after).length, baselineOnly: pairs.filter(p => p.before && !p.after).length,
    currentOnly: pairs.filter(p => !p.before && p.after).length, bothLose: pairs.filter(p => !p.before && !p.after).length }, pairs };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const pct = n => (100 * n).toFixed(1) + '%', interval = s => s.winRate95.map(pct).join('–');
const a = summary.baseline, b = summary.current;
const report = `# 三AI终极模拟配对测试\n\n两版各${n}局，种子${seed}–${seed + n - 1}，共${n * 2}局。原版策略来源：${commit}；两版其余游戏代码与数据一致，默认3候选。\n\n`
  + `| 指标 | 原版 | 新版 |\n| --- | ---: | ---: |\n| 通关 | ${a.wins}/${n} | ${b.wins}/${n} |\n| 通关率 | ${pct(a.rate)} | ${pct(b.rate)} |\n| 95%区间 | ${interval(a)} | ${interval(b)} |\n| 到Boss | ${a.bossReached}/${n} | ${b.bossReached}/${n} |\n| 通过Boss | ${a.bossCleared}/${n} | ${b.bossCleared}/${n} |\n| 到隐秘 | ${a.hiddenReached}/${n} | ${b.hiddenReached}/${n} |\n| 平均通过回合 | ${a.averageRounds.toFixed(2)} | ${b.averageRounds.toFixed(2)} |\n| 平均剩余LP | ${a.averageLp.toFixed(2)} | ${b.averageLp.toFixed(2)} |\n\n`
  + `配对结果：皆胜${summary.paired.bothWin}、仅原版胜${summary.paired.baselineOnly}、仅新版胜${summary.paired.currentOnly}、皆败${summary.paired.bothLose}。全部地图/Boss逐种子一致，运行错误0。\n\n`
  + `通关使用正式Match的victory；Boss通过使用roundsPassed≥bossRound；隐秘到达不是隐秘通关。并行${jobs}工作线程仅用于收集结果，未据此比较服务器决策延迟。策略差异会改变后续随机消耗，配对种子并不保证两版遭遇相同商店序列。未孤立分析补助、策略及分队偏好的各自贡献。\n\n`
  + `原始结果baseline.json/current.json，逐种子配对与统计summary.json，来源与数据哈希manifest.json。\n`;
fs.writeFileSync(path.join(out, 'report.md'), report);
process.stdout.write(report);
