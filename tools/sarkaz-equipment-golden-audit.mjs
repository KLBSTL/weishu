// Compare against the pre-equipment-and-squad revision baseline, never upstream HEAD.
import fs from 'node:fs';
const base = '../sarkaz-equipment-before-golden';
const reasons = {
  roster: '萨卡兹攻击层数系数、伊芙利特属性与阵营、两件新装备，以及哥伦比亚攻击触发和附着式持续伤害改变战斗。',
  bonds: '哥伦比亚成员取样与轰击触发/刷新伤害改变；萨卡兹层数加攻0.7%，装备参与测试分配。',
  fields: '同一阵容的攻击加成、轰击持续伤害及装备改变战斗输出和通过时间。',
  matches: '红豆购买价1、泥岩获得资金、首次刷新萨卡兹推荐、激活后叠层及两件新装备改变经济与后续阵容。',
  standins: '泥岩获取特质、盟约攻击力和装备配置影响补位场景；沿用既有技能。',
  diy: '检查自选兼容：技能本体未修改；若变化，来源为共有盟约/装备或场景抽样。',
};
const out = ['# 萨卡兹装备与盟约最终修订 — 黄金场景审计', '',
  '基线为本次装备/分队修订前保存的已发布版本；此表列出全部有意变更场景和字段。详细规则见 [哥伦比亚](design/columbia.md) 与 [萨卡兹](design/sarkaz.md)。', ''];
for (const [family, reason] of Object.entries(reasons)) {
  const before = JSON.parse(fs.readFileSync(`${base}/${family}.json`, 'utf8')).scenarios;
  const after = JSON.parse(fs.readFileSync(`test/golden/${family}.json`, 'utf8')).scenarios;
  const added = Object.keys(after).filter(k => !before[k]), removed = Object.keys(before).filter(k => !after[k]);
  const changed = Object.keys(after).filter(k => before[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  out.push(`## ${family}`, '', reason, '',
    `保持 ${Object.keys(after).length - added.length - changed.length}；新增 ${added.length}；移除 ${removed.length}；变化 ${changed.length}。`, '');
  for (const id of added) out.push(`- 新增：${id}`);
  for (const id of removed) out.push(`- 移除：${id}`);
  for (const id of changed) {
    const fields = [...new Set([...Object.keys(before[id]), ...Object.keys(after[id])])]
      .filter(k => JSON.stringify(before[id][k]) !== JSON.stringify(after[id][k]));
    out.push(`- ${id}：${fields.join(', ')}`);
  }
  out.push('');
}
fs.writeFileSync('docs/sarkaz-equipment-golden.md', out.join('\n').trimEnd() + '\n');
console.log(out.filter(l => /^(##|保持)/.test(l)).join('\n'));
