// Compare against the pre-handwritten-revision local baseline, never upstream HEAD.
import fs from 'node:fs';
const base = '../columbia-revision-before-golden';
const reasons = {
  roster: '名单及盟约标签变化重排战斗分组；新特质、两件装备、磐蟹阻挡和中继器数量改变结果。',
  bonds: '哥伦比亚改为共享冷却法术爆炸/持续区域；取样成员及次级盟约改变，获得/休整特质改动。',
  fields: '自动选取的阵容、盟约、装备效果改变输出及通过时间。',
  matches: '常规招募108降到106，新装备进入刷新池；身份牌、休整加层改变经济、刷新、阵容和后续战斗。',
  standins: '原NORMAL条目的新盟约标签和特质，以及分配装备变化影响补位场景。',
  diy: 'S3谬因允许三中继器，正式角色规则注册及共享装备变化；未改动其他自选技能公式。',
};
const out = ['# 哥伦比亚手稿修订 — 黄金场景审计', '',
  '基线为本次手稿修订开始前保存的本地版本；此表列出全部有意变更场景和字段。详细规则见 [哥伦比亚](design/columbia.md) 与 [萨卡兹](design/sarkaz.md)。', ''];
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
fs.writeFileSync('docs/columbia-revision-golden.md', out.join('\n').trimEnd() + '\n');
console.log(out.filter(l => /^(##|保持)/.test(l)).join('\n'));
