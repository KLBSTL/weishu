# 哥伦比亚文档方案完整 golden 审计

2026-10-12，相对已发布基线 `0c0b991b6b217ae55d9b5a2ffece382b7deab60b`。运行 `node tools/golden.mjs --update --jobs 4`，六个家族全部重算、退出0。此为有意玩法变更，不是性能或长期平衡结论。此前四本星极审计保留为历史，当前星极按文档三本。皮肤与动作偏好不进入游戏摘要。

## roster

当前48个，变化44个，新增0个，移除0个。

- `roster-004`：变化（killed, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-005`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-006`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-007`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-008`：变化（killed, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-009`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-010`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-011`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-012`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-013`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-014`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-015`：变化（players, units, enemies, hooks, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-016`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-017`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-018`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-019`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-020`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-021`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-022`：变化（killed, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-023`：变化（time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-024`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-025`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-026`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-027`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-028`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-029`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-030`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-031`：变化（time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-032`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-033`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-034`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-035`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-036`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-037`：变化（time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-038`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-039`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-040`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-041`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-042`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-043`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-044`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-045`：变化（rngDraws, units, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-046`：变化（killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。
- `roster-047`：变化（enemies, snaps）。锡人被动、哥伦比亚轰炸/燃烧和动力甲/装置规则改变；新增玩偶及装备本数/属性改变全装备轮转，因而改变对应阵容战斗摘要。

## bonds

当前50个，变化20个，新增0个，移除0个。

- `bond-columbiaShip-low`：变化（time, ticks, players, units, enemies, hooks, events, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-columbiaShip-high`：变化（time, ticks, units, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-investShip-low`：变化（players, units, hooks, events, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-investShip-high`：变化（time, ticks, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-lateranoShip-high`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-maniShip-high`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-miraShip-high`：变化（time, ticks, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-preciShip-high`：变化（players, units, enemies, hooks, events, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-raidShip-high`：变化（time, ticks, players, units, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-sargonShip-high`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-sarkazShip-high`：变化（units, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-siracusaShip-high`：变化（rngDraws, units, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-skillfulShip-high`：变化（hooks, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-soloShip-high`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-steadShip-high`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-suntShip-high`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-swiftShip-high`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-victoriaShip-high`：变化（time, ticks, players, units, enemies, hooks, events, fx, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-visiShip-high`：变化（units, hooks, events, snaps）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。
- `bond-yanShip-high`：变化（rngDraws, hooks, events）。哥伦比亚伤害触发、150%轰炸、固定区域50%跳伤及10层冷却步进改变；锡人属性/回技与可携带新装备改变相关盟约阵容摘要。

## fields

当前25个，变化23个，新增0个，移除0个。

- `boss-boss_1-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_2-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_2-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_3-pair`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_3-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_4-pair`：变化（killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_4-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_5-pair`：变化（time, ticks, reason, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_5-solo`：变化（killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_6-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_6-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_7-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `boss-boss_7-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_8-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_8-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_9-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_9-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_10-pair`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `hidden-boss_10-solo`：变化（bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `unite-1`：变化（players, units, enemies, hooks, events, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `unite-2`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `relay-boss-boss_1-solo`：变化（bossHpLeft, players, units, enemies, hooks, events, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。
- `relay-unite-2`：变化（rngDraws, players, units, enemies, hooks, events, fx, snaps）。首领/联防的装备与阵容模板轮转受新增玩偶和新装备属性影响，锡人及哥伦比亚轰炸规则改变对应战斗摘要。

## matches

当前18个，变化18个，新增0个，移除0个。

- `solo-FUNNY-1`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-FUNNY-2`：变化（rng, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-NORMAL-1`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-NORMAL-2`：变化（rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-HARD-1`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-HARD-2`：变化（rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-ABYSS-1`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-ABYSS-2`：变化（rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-NORMAL-3`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-HARD-4`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop3-ABYSS-5`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop4-FUNNY-6`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop4-ABYSS-7`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-NORMAL-8-serverrun`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `solo-HARD-9-boosted`：变化（rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-ABYSS-10-boosted`：变化（end, rng, rounds, players）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-NORMAL-14-standins`：变化（end, rng, rounds, players, standIns）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。
- `coop2-NORMAL-70-diy`：变化（end, rng, rounds, players, diy）。分队收入后自动获得/支付、星极三本扣款退款、山分时特质、赫默/谬因次数限制、10层玩偶奖励和陨星4/8改变资金、招募、层数与后续战斗。

## standins

当前11个，变化5个，新增0个，移除0个。

- `standin-05`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。自选补位保留特质与装备，锡人属性/回技及动力甲/装置新规则影响对应战斗摘要。
- `standin-07`：变化（rngDraws, snaps）。自选补位保留特质与装备，锡人属性/回技及动力甲/装置新规则影响对应战斗摘要。
- `standin-08`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。自选补位保留特质与装备，锡人属性/回技及动力甲/装置新规则影响对应战斗摘要。
- `standin-09`：变化（time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps）。自选补位保留特质与装备，锡人属性/回技及动力甲/装置新规则影响对应战斗摘要。
- `standin-10`：变化（time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps）。自选补位保留特质与装备，锡人属性/回技及动力甲/装置新规则影响对应战斗摘要。

## diy

当前138个，变化0个，新增0个，移除0个。

所有场景摘要保持相同。
