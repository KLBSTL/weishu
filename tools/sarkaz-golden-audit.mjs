// Generate a reviewable list of every changed golden scenario against the checkout base.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const families = ['roster', 'bonds', 'fields', 'matches', 'standins', 'diy'];
const reasons = {
  roster: 'New formal entries change roster grouping; Vigna, Mudrock and Nymph have new memberships/tiers/traits.',
  bonds: 'Membership lists change existing covenant teams; the new Sarkaz threshold/top-tier scenarios are added.',
  fields: 'Generated high-tier teams now include formal Wisadel/Typhon/Nymph; changed membership and shield rules affect combat. Echo retaliation carries the counter tag to prevent a Mlynar reflection loop exposed by the new team.',
  matches: 'The enlarged shop pool and moved tiers change seeded draws, teams, merges and subsequent combat. The stand-in fixture marks all NORMAL entries unowned so the expanded shop still exercises replacement operators.',
  standins: 'Mudrock tier and existing NORMAL members change grouping and inherited covenant effects. A separate full-carried-SP scenario preserves reserve guard S2 coverage when regrouped weak frontliners fall before charging.',
  diy: 'Sarkaz registers additional hooks; Wisadel shadow placement is now facing-relative. Existing DIY records retain their original token data.',
};
const out = ['# Sarkaz golden audit', '', 'Generated comparison against HEAD. Intentional gameplay/data changes; no baseline test thresholds were relaxed.', ''];
for (const family of families) {
  const file = 'test/golden/' + family + '.json';
  const before = JSON.parse(execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8', maxBuffer: 50e6 })).scenarios;
  const after = JSON.parse(fs.readFileSync(file, 'utf8')).scenarios;
  const added = Object.keys(after).filter(k => !before[k]);
  const removed = Object.keys(before).filter(k => !after[k]);
  const changed = Object.keys(after).filter(k => before[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const same = Object.keys(after).length - added.length - changed.length;
  out.push('## ' + family, '', reasons[family], '', 'Unchanged: ' + same + '; added: ' + added.length + '; removed: ' + removed.length + '; changed: ' + changed.length + '.', '');
  for (const id of added) out.push('- Added: ' + id);
  for (const id of removed) out.push('- Removed: ' + id);
  for (const id of changed) {
    const fields = [...new Set([...Object.keys(before[id]), ...Object.keys(after[id])])].filter(k => JSON.stringify(before[id][k]) !== JSON.stringify(after[id][k]));
    out.push('- ' + id + ': ' + fields.join(', '));
  }
  out.push('');
}
fs.writeFileSync('docs/sarkaz-golden.md', out.join('\n').trimEnd() + '\n');
console.log(out.filter(x => /^(##|Unchanged)/.test(x)).join('\n'));
