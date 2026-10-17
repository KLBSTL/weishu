# DESIGN §34 — 天灾 difficulty

Part of [DESIGN.md](../DESIGN.md). Maintainer-confirmed revision, 2026-10-17.
Full specification: [确认稿](../catastrophe-confirmed-20261017.md).
Implementation and validation: [实施记录](../catastrophe-revision-20261017.md).

## 34. 天灾 — maintainer-defined difficulty

`CATASTROPHE` inherits solo/co-op ABYSS modes, enemy scaling, entry requirements, timers, rewards and alive-player
pool shares. The selector offers NORMAL / HARD / ABYSS / CATASTROPHE; legacy FUNNY remains readable and its lobby
preference defaults to NORMAL. The icon is `public/icons/catastrophe.svg`. Difficulty-card effects remain qualitative.

The former extra HP×100 / ATK×10 / DEF×10 / RES×3 / 95% universal reduction and V/VI stock doubling are removed.
All difficulties now use original shared-stock caps, including per-piece overrides. No extra ATK, DEF or RES applies.

### 34.1 Stage scaling and lanes

| Stage | Extra HP | Extra speed | Incoming Physical / Arts HP damage |
|---|---:|---:|---:|
| R1–13 | ×1 | ×1.5 | ×1 |
| R14 Final Assault | ×1.5 | ×1 | ×0.75 |
| R15 Hidden Core | ×2 | ×1 | ×0.5 |

These stages replace, rather than multiply, one another. True/Elemental HP damage and HP loss receive no difficulty
reduction. Hit-count units receive the stage HP multiplier, but every valid instance removes exactly one hit:
all damage-reduction multipliers are bypassed, while invulnerability, dodge, valid damage types and shields still apply.

`shared/difficulty.js` supplies both runners. Enemy spawn mods remain unscaled so dynamic summons, parts, split
children and transformed copies receive the extra stage scaling once. Shared leader HP uses the original ABYSS pool
and alive-player factor, then ×1.5/×2; the leader syncs to that result without doubling it again.

At setup four distinct regular factions are drawn, plus SPECIAL. Each R1–13 independently chooses two distinct
candidates for upper/lower lanes. A separate deterministic lane RNG stream preserves the original ABYSS scheduling.
The original template and slot determine each lane's count, time, interval and route; only its enemy key/type changes.
Rounds whose original upper lane has zero spawns keep zero there, rather than inventing additional enemies.
Boss identities and their templates retain the original selection schedule.

### 34.2 Hidden Helm — 钢铁洪流

Below 20% HP its former 50% Physical/Arts guard is replaced by 80% Physical/Arts/True/Elemental HP damage reduction;
HP loss bypasses it. The difficulty Physical/Arts multiplier still applies separately.

Steel Flood starts at 0/50 defensive SP. Each independent positive HP damage instance gives 1 SP; absorbed hits,
element gauge and HP loss do not. It has lower priority than ready original skills and higher priority than ordinary
attacks. The 3s charge stops ordinary attacks/other skills and SP gain.

Completion summons one Imperial Armor solo or two on a paired field, using the original armor routes. All living
enemies, including existing reinforcements and new armors, gain a numeric barrier equal to 1% of Helm's Max HP.
This source caps at 2% per recipient, independently of other barrier caps/sources; it lasts until consumed/end of battle.
All living armors gain stun, freeze, sleep, bind, silence, fear, levitate and displacement immunity for the battle.
Cold, elemental buildup/bursts and stat debuffs still work. Each enhanced armor's true kill removes 1% of Helm's
Max HP exactly once; leaks do not. This fixed pool share bypasses the ordinary leader hit cap, like the original
drone-link pool loss, so the percentage remains effective on large co-op pools.

### 34.3 Hidden Gun — 代赎之罚

Permanent taunt −1. Each valid incoming allied damage instance checks the three springs' actual shield state
before Gun's numeric barrier absorbs it:

| Remaining spring shield | Punishment to the source |
|---|---|
| Elemental | 100 Corrosion buildup |
| Arts | 100 Arts damage per second for 10s |
| Hit count | Final ASPD ×0.5 for 10s |

Conditions are independent. DoT/ASPD debuffs refresh without stacking; DoT refresh preserves its next tick.
Final ASPD is multiplied after additive ASPD is clamped, then the existing 20–600 bounds apply.
With all three shields down each incoming allied hit instead removes another 2000 HP. Live springs without shields
do not count as shielded. HP loss and transmitted losses never trigger the ability. Counter-tagged punishment cannot
trigger allied reflection loops.

### 34.4 Hidden Pipe/String — 管弦合鸣

One shared 0/30 SP pool. Each complete ordinary attack from either boss gives 1 SP; skill attacks do not.
An actual Echo form change caused by either boss adds 3 SP, including original skills; allied changes do not.
Concord has priority over all original skills/attacks. During its joint 8s charge both bosses stop attacks/other skills
and gain no SP. A keyed warning ring ends immediately on interruption.

Completion applies 999 Necrosis to every deployed living ally, including summons and hidden/camouflaged units.
Device summons are exempt. Afterwards every unit currently in Necrosis burst (including an earlier burst) is forcibly
removed without fatal/kill/death dispatch, immortality/revive or operator redeploy. Nested removal callbacks also suppress
friendly-death triggers. Tactical crabs, wolf points and Manifolds retain only their original recovery mechanisms;
other later re-summoning is permitted.

Any Echo killed during the charge interrupts it, clears SP and resumes both bosses. Pipe immediately takes true damage
equal to 5% of its Max HP, bypassing all reductions, barriers and the single-hit cap; this can kill it.

### 34.5 Data and compatibility

`tools/catastrophe-data.mjs` runs last in `tools/build-data.mjs`. It clones completed ABYSS modes/schedules/templates
and generates separate, explicitly labeled Hidden Core ability notes in enemy details. Four UI language packs translate
these notes. The canonical original ability data is retained for other difficulties.

This revision also restores Victoria's eight formerly hidden formal recruit identities and their existing skins/actions:
刺玫、洛洛、薄绿、风笛、凯瑟琳、号角、维娜·维多利亚、焰影苇草. 哈洛德/烛煌 already remained visible.
The restored eight have 12 selectable extra skins in the validated catalogue; Catherine has default appearance only.
There are now 114 visible base recruits, tiers 17/18/19/21/18/21. Aegir hiding and saved ownership remain unchanged.
Mudrock normal/elite retain Sarkaz + 坚守; Shining normal/elite retain Sarkaz + 助力.

Chiave's band secretly adds +1 income at R4–6 and +2 at R7 onward (not cumulative); R1–3 and its displayed description
remain unchanged. The separate paused AI work is outside this revision.
