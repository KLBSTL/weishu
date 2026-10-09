// Compare against the saved local Sarkaz baseline, not upstream HEAD (which predates both expansions).
import fs from 'node:fs';
const base = '../testing/golden-before-columbia';
const reasons = {
  roster: '招募条目由119改为108，新增哥伦比亚技能/特质，分组顺序与阵容改变；萨卡兹六人由条件增伤改为屏障真伤。移除的是旧分组，保留角色的技能仍由新分组和专项测试覆盖。',
  bonds: '新增哥伦比亚低层/高层两个场景；隐藏成员与次级盟约调整改变各盟约取样阵容，萨卡兹屏障/提丰规则改变。',
  fields: '自动选择的高本阵容与人数盟约变化影响输出和通关时间；联防/决战仍关闭层数增长。',
  matches: '核心盟约数量、角色池和本数改变，固定种子的禁用/抽取/购买/阵容及后续战斗随之变化。',
  standins: '保留NORMAL原始补位规则；新增哥伦比亚钩子可能增加事件计数，已有成员盟约改变会改变战斗。',
  diy: '自选数值、技能与召唤物变体保留。此次138个自选场景均与上一版本逐字段一致，中继器正式注册未改变原有自选行为。',
};
const out = ['# 哥伦比亚与萨卡兹修订 — 黄金场景审计', '',
  '比较基线为本次工作开始前的本地萨卡兹版本快照 `ark/testing/golden-before-columbia`。本表列出每个移动场景及变化字段；新增角色、屏障真伤、招募池缩减均为有意玩法变更。', ''];
for (const family of Object.keys(reasons)) {
  const before = JSON.parse(fs.readFileSync(`${base}/${family}.json`)).scenarios;
  const after = JSON.parse(fs.readFileSync(`test/golden/${family}.json`)).scenarios;
  const added = Object.keys(after).filter(k => !before[k]), removed = Object.keys(before).filter(k => !after[k]);
  const changed = Object.keys(after).filter(k => before[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  out.push(`## ${family}`, '', reasons[family], '',
    `保持 ${Object.keys(after).length - added.length - changed.length}；新增 ${added.length}；移除 ${removed.length}；变化 ${changed.length}。`, '');
  for (const id of added) out.push(`- 新增：${id}`);
  for (const id of removed) out.push(`- 移除：${id}`);
  for (const id of changed) {
    const fields = [...new Set([...Object.keys(before[id]), ...Object.keys(after[id])])].filter(k => JSON.stringify(before[id][k]) !== JSON.stringify(after[id][k]));
    out.push(`- ${id}：${fields.join(', ')}`);
  }
  out.push('');
}
fs.writeFileSync('docs/columbia-golden.md', out.join('\n').trimEnd() + '\n');
console.log(out.filter(l => /^(##|保持)/.test(l)).join('\n'));
