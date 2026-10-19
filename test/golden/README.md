# Golden results

Catastrophe second confirmation (2026-10-17): publication keeps the already-published AI and rebuilds all
293 golden scenarios. The [publication audit](../../docs/catastrophe-second-release-golden.md) lists every moved case;
the [local implementation audit](../../docs/catastrophe-second-golden.md) is separately labeled against the paused local AI.
Dedicated boundary tests and Chromium/Node parity cover the new Catastrophe mechanics.

Catastrophe confirmation / Victoria restoration (2026-10-17): the published corpus has 293 scenarios
(51 roster, 50 bonds, 25 fields, 18 matches, 11 stand-ins, 138 DIY). Compared with the prior GitHub main,
141 existing scenarios intentionally change, three roster groups are added, none removed; all DIY results stay unchanged.
[Publication scenario audit](../../docs/catastrophe-release-golden.md) names every change. Golden JSON is rebuilt
with the already-published AI; paused local layer/Boss AI optimizations are excluded. Dedicated tests cover the
new Catastrophe mechanics, since the original corpus contains no Catastrophe scenarios. All 293 rechecked.

Visual migration (2026-10-15): roster-042 and standin-04 intentionally change for half-to-even hit tiles;
[scenario audit](../../docs/visual-migration-golden.md). The previously published AI and match digests are preserved.

Current weishu corpus (2026-10-13): 48 roster, 50 bonds, 25 fields, 18 matches, 11 stand-ins and 138 DIY scenarios,
290 total. The Columbia second DOCX and AI update recomputed all six families: 40 changed, no additions/removals,
all stand-in and DIY digests unchanged. [Full current audit](../../docs/columbia-v2-ai-golden.md) names every changed case and its reason;
the older counts and release notes below are retained as history.

The simulation is deterministic: the same seed and inputs give the same battle and the same match, bit for bit. These
files record the exact outcome of a fixed corpus of seeded scenarios, so a change that alters gameplay — even one meant
to be a pure refactor that only reorders random draws, hook order or iteration order — fails loudly instead of slipping
through.

- `tools/golden.mjs` builds the corpus from `data/*.json` (fixed order, fixed seeds) and reduces every scenario to a
  digest. Its header documents the families and the digest fields.
- `test/golden/<family>.json` hold the digests (`roster`, `bonds`, `fields`, `matches`, `standins`, `diy`).
- `test/golden.test.js` recomputes them and compares. On a mismatch it prints the scenario, the field and old → new.

## The corpus

| family | what runs |
|---|---|
| `roster` | 49 battles: every visible chess record (normal and elite) with every selectable skill and module (DESIGN §16), 12 operators per battle on a real stage (all 11 in turn) against the round's real wave three times over, every non-leader enemy kind of `data/enemies.json` as extra spawns (half of them bounties), placeable summons on the board, every equipment item, band, battle-side 机变 card and stage map card in turn, bonds from the board |
| `bonds` | 46 battles: every bond at its activation threshold (1 layer) and at its top tier (999 layers) |
| `fields` | 22 battles: every Final Assault / Hidden Core leader on a pair and a solo template (shared pool, 200 s cap) and the 联防 field with 1 and 2 helpers on the round's stage, both halves (carried HP / SP, a knocked-out operator, two leakers' enemies) |
| `matches` | 18 matches to the end in virtual time: 16 bot-only (solo 标准 / 险境 / 绝境 / 终极 × 2 seeds, co-op 2 / 3 / 4, one server-run combat match, two runs boosted to the Hidden Core), one co-op match whose human seat (AI 托管, offline) does not own 9 NORMAL chess — they fight as their 补位 stand-ins (its digest lists them per round, `standIns`) — and one whose human seat slots 自选 picks (推进之王 and prototypes) with its 调度中心 at level 5 from the first prep: its own shop draws them and its AI fields 推进之王 (its digest lists per round the 自选 shop draws and the fielded pieces, `diy`) |
| `standins` | 10 battles: every NORMAL chess record (normal and elite, 110) fielded as its 补位 stand-in (`standIn: true`: the stand-in's body, backup skill / module and kit — all 17 stand-ins, every skill a chess names for them), 12 per battle by strength band, laid out by the stand-in's position on a real stage, against the round's real wave three times over plus 8 ground enemy kinds (melee stand-ins always meet an enemy), an item each, bonds from the board |
| `diy` | battles of 自选 pieces (a DIY slot with its `diy` pick, `shared/diy.js`): every owned 6★ with an operator kit (`kits/index.js OPERATOR_KITS`) in each form of tiers 5 and 6 (normal; elite with no module and with each module) under each skill, then every prototype pick with a kit at its locked selection, normal and elite, 12 per battle against the round's real wave; a new operator kit adds its scenarios (the battle count grows with the kits) |

Battles go through the production BattleSpec path (`server/sim/spec.js`, as browsers and the server's headless fields
run them); matches construct `Match` directly with a `VirtualScheduler`. Every option is explicit, so a change to a
test-harness default never moves a digest.

What a digest ignores on purpose (it does not affect gameplay): object key order, engine unit ids (snapshot ids are
renumbered by first appearance, units are named by board uid or def id), board piece uids, the order of client events
within a tick (they are counted, not hashed) and wall-clock time. Damage / healing sums are rounded to integers and HP
to 2 decimals.

`npm test` runs the fast subset (the scenarios marked `"fast": true`: every chess record with its default loadout,
every stage and every non-leader enemy kind, every bond at its top tier, six fields, seven matches, the five stand-in
battles of the normal records, the first 自选 battle of the operator kits and of the prototypes — 62 of the 151). `GOLDEN_FULL=1` checks everything.

## Workflow

Columbia transaction revision: [scenario audit](../../docs/columbia-trade-golden.md) lists the five changed complete-match scenarios; all other 285 scenarios stay unchanged relative to the relay-map baseline.

Relay map extension: the four dedicated `relay-*` scenarios cover normal, solo/paired boss and unite fields.
Manual-only maps are excluded from the original stage rotation so existing baselines remain comparable.
Rules and scenario names: [relay map](../../docs/design/relay-map.md).

Latest Typhon allowance and bond-tag update: [scenario audit](../../docs/typhon-independent-golden.md), compared with 04cc838.

Latest numeric-only Columbia update: [scenario audit](../../docs/columbia-numeric-golden.md), compared with fa3c798.

Local Sarkaz and Columbia expansion: the corpus currently has 47 roster, 50 bond, 22 field, 18 match, 11 stand-in and 138 DIY scenarios (286 total). Revised traits, equipment and shop priority intentionally change combat and recruitment outcomes. All 138 DIY baselines remain unchanged. The extra stand-in case carries full SP to exercise reserve guard S2 independently of its survival in regrouped teams; the stand-in match marks all NORMAL entries unowned. [Equipment and covenant audit](../../docs/sarkaz-equipment-golden.md) lists every baseline move and its reason; [Columbia scenario audit](../../docs/columbia-golden.md) and [earlier Sarkaz audit](../../docs/sarkaz-golden.md) are retained as history.

```sh
GOLDEN_FULL=1 node --test test/golden.test.js   # the whole corpus (≈ 20 s with 4 worker threads)
node --test test/golden.test.js                 # the fast subset
npm run golden                                  # the same comparison from the tool (all families, a short report)
npm run golden:update                           # recompute and rewrite test/golden/*.json
node tools/golden.mjs --twice                   # determinism: the corpus twice in one process, the second pass reversed
```

- **A refactor commit must never change these files.** Run `GOLDEN_FULL=1 node --test test/golden.test.js` before
  committing it. If a digest moves, the refactor changed behaviour: find out why (the first differing value of `snaps`
  says when two runs parted, in 10-game-second steps) instead of updating the files.
- **An intended gameplay change** (a fix, new content, a data rebuild): run `npm run golden:update` and commit the
  changed files together with the change, saying in the commit message which scenarios moved and why.
- **Reviewing the diff:** every scenario is a block of its own and every unit / enemy / round is one line, so a diff
  shows which scenarios moved and which values changed. A change confined to the scenarios that contain the touched
  operator, enemy or rule is expected; a change everywhere (every `rngDraws`, every `snaps`) means something global
  moved — the RNG draw order, the tick order, a shared rule.
- **Adding to the corpus** (a new family, more scenarios, a new digest field) changes the files by design: do it in a
  commit of its own, never together with a refactor.
- A new engine hook, event or chess record does not change the digests of the existing scenarios by itself — the
  hook list is frozen in the tool and the corpus is regenerated only on `golden:update` — but new data records do join
  the corpus there (the roster family enumerates `data/chess.json`).

Ultimate groups/DIY (2026-10-17): regenerate with the published AI; the [audit](../../docs/ultimate-three-release-golden.md)
lists moved scenarios and new Clement coverage. Paused local AI changes are excluded.

Catastrophe R12 advanced bounties (2026-10-17): 294 scenarios verified with published AI; 51 roster and 11 stand-in
scenarios move because nine new enemies enter the sorted mixed-enemy allocation. Other families are unchanged.
Every moved case is listed in [the audit](../../docs/r12-bounty-golden-audit.md).

Anti-Armor Infantry damage fix (2026-10-18): enumerate all 294 cases and recompute the 11 cases that contain RPG
enemies or may draw them in Ultimate matches. Seven digests move; four stay unchanged. The other 283 are retained
without rerunning. [Scenario audit](../../docs/rpg-damage-golden-20261018.md) lists every moved id and reason.

Ultimate three-type balance (2026-10-19): recompute/verify 38 relevant Ultimate battles/matches; 9 move and 29 stay
unchanged. Other 256 scenarios are retained without rerunning. [Full moved-id audit](../../docs/ultimate-balance-golden-20261019.md).
