// Clone the completed ABYSS data after the local expansions; never edit generated JSON by hand.
import { CATASTROPHE_ENEMY } from '../shared/difficulty.js';

export function finishCatastrophe(files) {
  const { config, choices, stages, bosses, waves } = files;
  for (const type of ['single', 'multi']) {
    const source = `mode_${type}_abyss`, target = `mode_${type}_catastrophe`;
    const base = config.modes[source];
    if (!base) throw new Error(`天灾 requires ${source}`);
    config.modes[target] = {
      ...structuredClone(base), modeId: target, difficulty: 'CATASTROPHE', baseDifficulty: 'ABYSS',
      name: '天灾模拟', code: 'AC-5', sortId: base.sortId + 1, color: '#c875ff',
      iconId: 'mode_catastrophe_icon', unlockText: null,
      desc: '终极模拟基础上的天灾挑战',
      effectDescList: ['领袖阶段敌方生命与攻击力增加', '敌方防御、法抗与减伤增加', '高阶干员卡池数量增加'],
      bossEnemyModifiers: { ...CATASTROPHE_ENEMY },
    };
    if (choices.schedule?.[source]) choices.schedule[target] = structuredClone(choices.schedule[source]);
    for (const stage of Object.values(stages)) if (stage.modes?.includes(source) && !stage.modes.includes(target)) stage.modes.push(target);
    for (const boss of Object.values(bosses)) if (boss.templates?.[source]) boss.templates[target] = structuredClone(boss.templates[source]);
    for (const wave of Object.values(waves)) {
      const uses = wave.usedBy?.filter(use => use.modeId === source) || [];
      for (const use of uses) wave.usedBy.push({ ...use, modeId: target });
    }
  }
  // Results and bans retain the ABYSS schedule and reward factors; only the specified difficulty rules differ.
  const inherit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && Object.hasOwn(value, 'ABYSS')) value.CATASTROPHE = structuredClone(value.ABYSS);
    for (const [key, child] of Object.entries(value)) if (key !== 'modes') inherit(child);
  };
  inherit(config);
  if (!config.hiddenCore.difficulties.includes('CATASTROPHE')) config.hiddenCore.difficulties.push('CATASTROPHE');
}
