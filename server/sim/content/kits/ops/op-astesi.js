// 星极: official cached character/skill blackboards; both skills, deployment-time ASPD talent.
import { num, skillBbOf } from '../shared/tier1.js';
import { rampAspd } from '../shared/columbia.js';
export default {
  char_274_astesi: (bb, chess) => {
    const a = skillBbOf(chess, 'skchr_astesi_1'), b = skillBbOf(chess, 'skchr_astesi_2');
    return { talents: [rampAspd(chess, 'astesi:aspd')], skills: {
      skchr_astesi_1: { kind: 'duration', mods: { atkPct: num(a.atk), defPct: num(a.def) } },
      skchr_astesi_2: { kind: 'duration', mods: { atkPct: num(b.atk), defPct: num(b.def), blockCnt: num(b.block_cnt, 1) },
        attack: { hitAllBlocked: true } },
    } };
  },
};
