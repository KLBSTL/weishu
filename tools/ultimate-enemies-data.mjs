// User-approved 2026-10-17 design; official database stats, existing count coefficients or 1 [ASSUMED, approved].
const K = {
  mortar: 'enemy_1024_mortar', mortar2: 'enemy_1024_mortar_2', rpg: 'enemy_1143_merrpg', rpg2: 'enemy_1143_merrpg_2',
  knight: 'enemy_1184_cadkgt', knight2: 'enemy_1184_cadkgt_2', armor: 'enemy_1256_lyacpa', armor2: 'enemy_1256_lyacpa_2',
  caster: 'enemy_1176_dusocr', caster2: 'enemy_1176_dusocr_2', ghost: 'enemy_1008_ghost', ghost2: 'enemy_1026_aghost',
  bully: 'enemy_1058_traink', bully2: 'enemy_1058_traink_2', witch: 'enemy_1089_ltlntc', witch2: 'enemy_1089_ltlntc_2',
  ursus: 'enemy_1111_ucommd', ursus2: 'enemy_1111_ucommd_2', boar: 'enemy_1309_mhboar', boar2: 'enemy_1309_mhboar_2',
  shell: 'enemy_2043_smsbr', wood: 'enemy_2046_smwar', puppet: 'enemy_1130_infstr', spider: 'enemy_1132_sarchn',
  spider2: 'enemy_1132_sarchn_2', giant: 'enemy_1133_harchn', giant2: 'enemy_1133_harchn_2',
  apostle: 'enemy_1321_wdarft', apostle2: 'enemy_1321_wdarft_2', sailor: 'enemy_10043_sailor', sailor2: 'enemy_10043_sailor_2',
  captain: 'enemy_10049_pcaptn', captain2: 'enemy_10049_pcaptn_2', plasm: 'enemy_1137_plasm', tumor: 'enemy_1138_tumor',
  seed: 'enemy_1269_nhfly', seed2: 'enemy_1269_nhfly_2',
};
// id, minRound, maxRound, N, E, S, weight. Duplicate keys are intentional; the group id is the draw identity.
const GROUPS = {
  FIREPOWER: [
    ['1',1,7,'mortar','rpg','mortar',10], ['2',1,7,'rpg','mortar','rpg',10],
    ['3',6,7,'rpg','mortar','armor',8], ['4a',5,6,'knight','knight','knight',6],
    ['4b',7,7,'knight','knight','caster',8], ['5',8,9,'mortar2','rpg2','armor',10],
    ['6',8,13,'rpg2','mortar2','armor',10], ['7',10,13,'mortar2','rpg2','armor2',10],
    ['8',8,8,'knight','knight2','caster',8], ['9',9,13,'knight','knight2','caster2',10],
  ],
  BREAKTHROUGH: [
    ['1',1,4,'ghost','shell','shell',10], ['2',2,4,'shell','ghost','shell',10],
    ['3a',4,5,'shell','ursus','shell',10], ['3b',6,7,'shell','ursus','bully',10], ['4',6,7,'shell','ursus','boar',8],
    ['5',6,7,'witch','witch','witch',8], ['6',7,7,'shell','wood','bully',6],
    ['7a',8,10,'ghost2','shell','wood',10], ['7b',11,13,'shell','ursus2','wood',10],
    ['8a',8,9,'shell','ursus2','bully',10], ['8b',10,13,'shell','ursus2','bully2',10], ['9a',8,9,'ghost2','ursus2','boar',8],
    ['9b',10,10,'ghost2','ursus2','boar2',8], ['9c',11,13,'shell','ursus2','boar2',8],
    ['10a',8,10,'ghost2','ghost2','witch2',8], ['10b',11,13,'witch','witch','witch2',8],
  ],
  SUMMON: [
    ['0a',3,7,'plasm','plasm','plasm',10], ['1',1,7,'plasm','puppet','spider',12],
    ['2',6,9,'plasm','spider','giant',14], ['3',6,8,'sailor','sailor','captain',14],
    ['4',8,9,'tumor','spider2','giant',14], ['5',10,13,'tumor','spider2','giant2',14],
    ['6',9,13,'sailor2','sailor2','captain2',14], ['7',8,10,'seed','seed','apostle',14],
    ['8',11,13,'seed2','seed2','apostle2',14], ['9',8,13,'tumor','puppet','spider2',12],
  ],
};

export function prepareUltimateEnemies(ctx) {
  // Include direct units and their blackboard-referenced children in the standard data builder.
  ctx.act.enemyInfoDict.ULTIMATE_ADDITIONS = Object.values(K);
}

export function finishUltimateEnemies(files) {
  const { factions, enemies, backups } = files;
  const specs = [
    ['FIREPOWER','火力','远程群攻与重装火力交替推进。','SPECIAL'],
    ['BREAKTHROUGH','突破','穿越阻挡、冲撞与高耐久单位形成突破压力。','INVISIBLE'],
    ['SUMMON','召唤','母体与子体共同推进，注意持续召唤单位。','TIMES'],
  ];
  for (const [type,name,desc,iconType] of specs) {
    const ids = [];
    for (const [id,minRound,maxRound,n,e,s,weight] of GROUPS[type]) {
      const entryId = `ultimate_${type.toLowerCase()}_${id}`;
      for (const k of [n,e,s]) if (!enemies[K[k]]) throw new Error(`Missing ultimate enemy ${k}`);
      factions.entries[entryId] = { entryId, key: K[s], type, weight, minRound, maxRound,
        fly: !!enemies[K[s]].isFlyEnemy, N: [{ key: K[n] }], E: [{ key: K[e] }], inactiveIn: [],
        difficulties: ['ABYSS','CATASTROPHE'] };
      ids.push(entryId);
    }
    factions.types[type] = { type, name: `特训敌人·${name}`, desc, icon: factions.types[iconType].icon,
      sortId: 10 + specs.findIndex(s=>s[0]===type), typeIdentifier: `ultimate_${type.toLowerCase()}`,
      involveRandom: true, count: 3, weight: 1, pool: [...new Set(GROUPS[type].flatMap(g=>g.slice(3,6).map(k=>K[k])))],
      entries: ids, difficulties: ['ABYSS','CATASTROPHE'] };
    factions.generation.typeSlots[type] = 3;
  }
  factions.generation.presetMotherCaps = {
    enemy_1133_harchn: [[6,7,2],[8,10,3],[11,13,4]],
    enemy_1133_harchn_2: [[6,7,2],[8,10,3],[11,13,4]],
    enemy_10049_pcaptn: [[6,7,2],[8,10,3],[11,13,4]],
    enemy_10049_pcaptn_2: [[6,7,2],[8,10,3],[11,13,4]],
    enemy_1321_wdarft: [[8,11,2],[12,13,3]], enemy_1321_wdarft_2: [[8,11,2],[12,13,3]],
  };
  factions.generation.summonBudget = { motherBatchMul: 2, childPowerMul: .75,
    mothers: [K.puppet,K.spider,K.spider2,K.giant,K.giant2,K.captain,K.captain2,K.apostle,K.apostle2],
    families: { [K.giant2]: K.giant, [K.captain2]: K.captain, [K.apostle2]: K.apostle } };
  for (const id of ['char_4132_ascln','char_4231_clemnt']) if (backups.diy.operators[id]) backups.diy.operators[id].bonds = ['emptyShip'];
  backups.diy.operators.char_4037_demetr.bonds = ['siracusaShip'];
}
