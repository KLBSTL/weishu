# 2026-10-22盟约与特质更新：golden差异审计

2026-10-23恢复工作后核对。主比较基线为本次已发布父提交 `e8da4d040a2403063a6a4572d4ee17f695844498`；另保留任务前本地副本比较。没有放宽断言，没有修改场景生成器、种子或测试预算。每个移动场景在下表逐一列出。

原本地golden已经与GitHub不同，不能把原本地全部变化视为本批机制变化。下列“原本地差异”单独记录这一点；自选139场对已发布版本完全一致。当前生成文件的内容错误计数全部为零。最后的重新计算比较结果在[实施记录](balance-update-20261022.md)记录。

## roster

恢复九名阿戈尔正式棋子、录武官改四本及自然盟约调整改变自动编组、技能/装备分配与后续战斗；并覆盖本批特质和盟约规则。

当前55场。已发布基线：变化51，新增4，不变0，无移除。任务前本地：变化或新增55；任务前本地与已发布版本差异51。

- 新增 roster-051：恢复正式棋子后自动编组扩展；pass 2 band 7: chess_char_6_03_b chess_char_6_06_b chess_char_6_07_b chess_char_6_01_b chess_char_6_02_b chess_char_6_04_b chess_char_6_05_b chess_char_6_08_b chess_char_6_09_b chess_char_6_11_b chess_char_6_12_b chess_char_6_13_b token_10017_skadi2_dedant token_10030_mlyss_wtrman。
- 新增 roster-052：恢复正式棋子后自动编组扩展；pass 2 band 7: chess_char_6_15_b chess_char_6_19_b chess_char_5_13_b chess_char_6_17_b chess_char_6_14_b chess_char_6_16_b chess_char_6_18_b chess_char_6_20_b chess_char_6_columbia_aphris_b chess_char_6_columbia_heyak_b chess_char_6_sarkaz_wisdel_b chess_char_5_12_b token_10070_aphris_pc。
- 新增 roster-053：恢复正式棋子后自动编组扩展；pass 3 band 5: chess_char_4_23_b chess_char_3_04_b chess_char_4_09_b chess_char_3_21_b chess_char_4_13_b。
- 新增 roster-054：恢复正式棋子后自动编组扩展；pass 3 band 7: chess_char_5_20_b chess_char_5_sarkaz_typhon_b chess_char_6_05_b chess_char_6_columbia_heyak_b。

| 场景 | 改变字段 | 自动阵容说明变化 | 原因 |
| --- | --- | --- | --- |
| roster-001 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-002 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-003 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-004 | about, killed, total, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-005 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-006 | about, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-007 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-008 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-009 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-010 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-011 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-012 | about, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-013 | about, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-014 | about, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-015 | about, round, waveId, time, ticks, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-016 | about, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-017 | about, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-018 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-019 | about, time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-020 | about, fast, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-021 | about, fast, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-022 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-023 | about, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-024 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-025 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-026 | about, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-027 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-028 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-029 | about, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-030 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-031 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-032 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-033 | about, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-034 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-035 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-036 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-037 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-038 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-039 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-040 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-041 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-042 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-043 | about, round, waveId, time, ticks, reason, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-044 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-045 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-046 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-047 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-048 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-049 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| roster-050 | about, round, waveId, time, ticks, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| relay-roster-001 | about, killed, total, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |

任务前已有差异：roster-001、roster-002、roster-003、roster-004、roster-005、roster-006、roster-007、roster-008、roster-009、roster-010、roster-011、roster-012、roster-013、roster-014、roster-015、roster-016、roster-017、roster-018、roster-019、roster-020、roster-021、roster-022、roster-023、roster-024、roster-025、roster-026、roster-027、roster-028、roster-029、roster-030、roster-031、roster-032、roster-033、roster-034、roster-035、roster-036、roster-037、roster-038、roster-039、roster-040、roster-041、roster-042、roster-043、roster-044、roster-045、roster-046、roster-047、roster-048、roster-049、roster-050、relay-roster-001。

## bonds

自然盟约、正式棋子池和本数改变按盟约选出的取样阵容；萨卡兹、哥伦比亚、炎、拉特兰以及指定干员的新机制同时生效。表中列出各场景阵容说明是否改变。

当前50场。已发布基线：变化50，新增0，不变0，无移除。任务前本地：变化或新增50；任务前本地与已发布版本差异0。

| 场景 | 改变字段 | 自动阵容说明变化 | 原因 |
| --- | --- | --- | --- |
| bond-arcaneShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-arcaneShip-high | about, rngDraws, players, units, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-columbiaShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-columbiaShip-high | about, rngDraws, units, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-deputShip-low | about, time, ticks, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-deputShip-high | about, time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-egirShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-egirShip-high | about, time, ticks, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-emptyShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-emptyShip-high | about, time, ticks, reason, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-indomShip-low | about, time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-indomShip-high | about, time, ticks, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-investShip-low | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-investShip-high | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-kazimierzShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-kazimierzShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-kjeragShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-kjeragShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-lateranoShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-lateranoShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-maniShip-low | about, time, ticks, rngDraws, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-maniShip-high | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-miraShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-miraShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-preciShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-preciShip-high | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-raidShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-raidShip-high | about, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-sargonShip-low | about, time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-sargonShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-sarkazShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-sarkazShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-siracusaShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-siracusaShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-skillfulShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-skillfulShip-high | about, time, ticks, rngDraws, players, units, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-soloShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-soloShip-high | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-steadShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-steadShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-suntShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-suntShip-high | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-swiftShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-swiftShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-victoriaShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-victoriaShip-high | about, time, ticks, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-visiShip-low | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-visiShip-high | about, time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-yanShip-low | about, time, ticks, rngDraws, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| bond-yanShip-high | time, ticks, players, units, enemies, hooks, events, fx, snaps | 否 | 本批盟约/特质效果 |

## fields

按可见高本棋子自动生成的首领/联防友方阵容改变；与新特质及盟约效果共同影响战斗。敌方配置与难度未在生成器中改动；天灾隐秘铳额外由专项测试验证。

当前25场。已发布基线：变化25，新增0，不变0，无移除。任务前本地：变化或新增25；任务前本地与已发布版本差异10。

| 场景 | 改变字段 | 自动阵容说明变化 | 原因 |
| --- | --- | --- | --- |
| boss-boss_1-pair | about, time, ticks, reason, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_1-solo | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_2-pair | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_2-solo | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_3-pair | about, time, ticks, reason, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_3-solo | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_4-pair | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_4-solo | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_5-pair | about, time, ticks, reason, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_5-solo | about, time, ticks, reason, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_6-pair | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_6-solo | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_7-pair | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| boss-boss_7-solo | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_8-pair | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_8-solo | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_9-pair | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_9-solo | about, time, ticks, reason, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_10-pair | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| hidden-boss_10-solo | about, killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| unite-1 | about, rngDraws, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| unite-2 | about, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| relay-boss-boss_1-pair | about, time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| relay-boss-boss_1-solo | about, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |
| relay-unite-2 | about, rngDraws, players, units, enemies, hooks, events, fx, snaps | 是 | 自动阵容或编组变化，及本批机制 |

任务前已有差异：boss-boss_2-pair、boss-boss_2-solo、boss-boss_4-pair、boss-boss_4-solo、boss-boss_6-pair、boss-boss_6-solo、hidden-boss_8-pair、hidden-boss_8-solo、hidden-boss_10-pair、hidden-boss_10-solo。

## matches

正式商店池恢复阿戈尔、本数和自然盟约改变，同种子的购买、合成、整备与战斗随之改变。保留已发布稳定AI，不引入本地实验。

当前18场。已发布基线：变化18，新增0，不变0，无移除。任务前本地：变化或新增18；任务前本地与已发布版本差异0。

| 场景 | 改变字段 | 自动阵容说明变化 | 原因 |
| --- | --- | --- | --- |
| solo-FUNNY-1 | rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-FUNNY-2 | rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-NORMAL-1 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-NORMAL-2 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-HARD-1 | rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-HARD-2 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-ABYSS-1 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-ABYSS-2 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop2-NORMAL-3 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop2-HARD-4 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop3-ABYSS-5 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop4-FUNNY-6 | rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop4-ABYSS-7 | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop2-NORMAL-8-serverrun | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| solo-HARD-9-boosted | rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop2-ABYSS-10-boosted | end, rng, rounds, players | 否 | 商店池/整备/战斗规则 |
| coop2-NORMAL-14-standins | end, rng, rounds, players, standIns | 否 | 商店池/整备/战斗规则 |
| coop2-NORMAL-70-diy | end, rng, rounds, players, diy | 否 | 商店池/整备/战斗规则 |

## standins

保留原补位身体、技能与模组；自然身份与本数变化影响补位继承的盟约和编组。仅四个相对已发布版本发生变化，其余与已发布结果相同。

当前11场。已发布基线：变化4，新增0，不变7，无移除。任务前本地：变化或新增11；任务前本地与已发布版本差异11。

| 场景 | 改变字段 | 自动阵容说明变化 | 原因 |
| --- | --- | --- | --- |
| standin-03 | killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 否 | 继承的自然盟约变化 |
| standin-04 | time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 否 | 继承的自然盟约变化 |
| standin-08 | killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 否 | 继承的自然盟约变化 |
| standin-09 | time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 否 | 继承的自然盟约变化 |

任务前已有差异：standin-01、standin-02、standin-03、standin-04、standin-05、standin-06、standin-07、standin-08、standin-09、standin-10、standin-cguard-carry。

## diy

相对已发布版本全部139场一致。任务前本地27场旧结果与已发布版本不一致；重算回到已发布结果，不属于本次修改自选技能或战斗。克莱门莎阿戈尔身份由专项数据测试覆盖。

当前139场。已发布基线：变化0，新增0，不变139，无移除。任务前本地：变化或新增27；任务前本地与已发布版本差异27。

任务前已有差异：diy-004、diy-010、diy-016、diy-022、diy-028、diy-034、diy-040、diy-046、diy-052、diy-058、diy-064、diy-070、diy-076、diy-082、diy-088、diy-094、diy-100、diy-106、diy-112、diy-118、diy-124、diy-130、diy-135、diy-136、diy-137、diy-138、diy-139。
