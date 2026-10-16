# DESIGN §34 — 天灾 difficulty

Part of [DESIGN.md](../DESIGN.md). The user-defined rules of this fork.

## 34. 天灾 — maintainer-defined difficulty

The local `CATASTROPHE` difficulty uses the completed solo/co-op ABYSS configuration. New selection UI shows
NORMAL, HARD, ABYSS, CATASTROPHE; FUNNY remains supported for existing records, rooms and regression fixtures.
An absent/old FUNNY lobby preference selects NORMAL. The new original SVG is `public/icons/catastrophe.svg`.

### 34.1 Boss rounds

Only boss/hidden battles in rounds 14 and 15 of `mode_single_catastrophe` / `mode_multi_catastrophe` receive the
additional multipliers: enemy HP ×100, ATK ×10, DEF ×10, RES ×3 and incoming HP damage ×0.05. This is an intentional
maintainer rule, applied on top of ABYSS, including its speed, original enemy scaling and hit-count exclusions.
Existing RES aggregation remains capped at 100 and the normal physical/Arts minimum-damage formula is retained.

`shared/difficulty.js` is the single numeric definition for the server and browser. `spawnEnemy` scales all enemies,
including leaders, parts, escorts, summons, split children and transformed copies. Original `e.mods` stay unchanged
so inheritance does not compound the extra multipliers. Husk HP and explicit pilot DEF/RES transitions retain the
extra scale. Shared boss HP uses ABYSS blood points and the original alive-player factor, then ×100; the displayed
leader syncs to that pool, without applying the HP multiplier a second time.

The 95% reduction is applied after normal mitigation, before shields and the original boss single-hit limit.
It covers physical, Arts, true, elemental HP damage and hit-count damage, independently of purgeable buffs or rebirth.
Elemental buildup is not HP damage; direct HP losses retain the existing bypass rules. No multiplier applies to
allied units or rounds 1–13. Hidden entry thresholds, timers, overtime, rewards and non-gameplay title rules inherit ABYSS.

### 34.2 Shared stock

The user confirmed shop tier V/VI, rather than original Operator rarity. `GameData.poolCopies` doubles the normal
cap (V 8→16, VI 5→10) after per-piece overrides (Muelsyse 4→8). Existing copy-weighted rolls, shop-level restrictions,
purchase/merge/return accounting and bans apply. Shop slot counts, equipment stock and tiers I–IV are unchanged.

`tools/catastrophe-data.mjs`, called last by `tools/build-data.mjs`, clones both ABYSS modes, draft schedules, stage
eligibility, boss-template references and wave usage metadata, and inherits ABYSS result/bans settings. Generated
JSON is not edited directly. The UI descriptions are translated through all four interface language packs. Per the
user's follow-up, difficulty-card effects say only that enemy attributes and high-tier stock increase; exact numeric
rules are documented here rather than printed below the difficulty name.

Implementation draft and validation: [天灾难度草案](../catastrophe-difficulty-draft.md).
