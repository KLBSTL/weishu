// Clone the completed ABYSS data after the local expansions; never edit generated JSON by hand.
import { CATASTROPHE_ENEMY } from '../shared/difficulty.js';

export function finishCatastrophe(files) {
  const { config, choices, stages, bosses, waves, enemies } = files;
  for (const type of ['single', 'multi']) {
    const source = `mode_${type}_abyss`, target = `mode_${type}_catastrophe`;
    const base = config.modes[source];
    if (!base) throw new Error(`天灾 requires ${source}`);
    config.modes[target] = {
      ...structuredClone(base), modeId: target, difficulty: 'CATASTROPHE', baseDifficulty: 'ABYSS',
      name: '天灾模拟', code: 'AC-5', sortId: base.sortId + 1, color: '#c875ff',
      iconId: 'mode_catastrophe_icon', unlockText: null,
      desc: '终极模拟基础上的天灾挑战',
      effectDescList: ['道中敌人移速增加，两路类型不同', '领袖阶段敌方生命与物理、法术减伤增加', '隐秘核心领袖能力增加'],
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
  // Separate from the original abilities: these notes describe only the Catastrophe Hidden Core.
  enemies.enemy_9013_acstmk_2.catastropheAbilities = [
    '生命低于20%时，物理、法术、元素与真实伤害降低80%，不减免生命流失。',
    '【钢铁洪流】受击回复，初始0／上限150／每次消耗50技力，蓄力1秒、完成后冷却5秒。按扣费前技力召唤甲胄：50—99单人1只／双人2只，100以上翻倍；为存活敌人增加1%胄最大生命的屏障，150技力时增加5%，本技能来源上限10%。强化甲胄异常免疫；每只甲胄被击杀使胄流失0.5%最大生命。',
  ];
  enemies.enemy_9017_achunt_2.catastropheAbilities = [
    '【代赎之罚】常驻嘲讽－1。元素／法术／频次护盾仍存在时，受击分别使伤害来源受到100侵蚀、每秒100法伤持续10秒、最终攻速减半10秒；后两项只刷新。三盾全破后每次受击额外流失2000生命。',
  ];
  const concord = '【管弦和鸣】共享技力，初始0／消耗30，管首次低于半血后永久降为20并排队一次免费合奏，免费自然结束保留技力。每次普攻回复1，Boss造成余音换形额外回复3。直接合奏10秒，双方停止行动与回复技力，每秒全场100凋亡；开始及期间凋亡爆发的非装置单位立即退场，不触发死亡效果，战术点可恢复。击杀余音中断当前合奏、清空技力并实际扣除管5%最大生命，不取消排队的免费合奏。';
  for (const id of ['enemy_9021_acduml_2', 'enemy_9022_acdumm']) enemies[id].catastropheAbilities = [concord];
}
