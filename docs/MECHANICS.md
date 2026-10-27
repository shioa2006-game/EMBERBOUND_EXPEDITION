# EMBERBOUND EXPEDITION — Final Mechanics Reference (implementation truth)

`docs/DESIGN.md` is the original pitch. **This file supersedes it** where they differ. The code in
`src/core` + `src/data` is the source of truth; this file explains it for renderer/UI/audio/test authors.

## Architecture
```
src/core/        DOM-free simulation (runs in Node for tests & balance sim)
  types.ts       all shared types (Unit, BattleEvent, SaveData, Mods, ...)
  balance.ts     curves & constants (BAL), formatNum, formatTime, gearTier, nextMilestone
  battle.ts      Battle class: tick(dt), cast(hero, manual), setFocus(id), activateOverdrive(), retreat(), drainEvents()
  state.ts       save actions: buyLevels, buyLevelsEvenly, buyNode, nodeView, applyRunResult -> Notice[], rekindle, relics...
  save.ts        localStorage persistence (loadSave / writeSave / deleteSave / exportSave / importSave)
  mods.ts        computeMods(save) -> Mods (tree + relics + prestige)
src/data/        heroes, enemies, areas, tree (skill tree nodes w/ layout x,y in 1200x800), relics
src/render/      Renderer (canvas) — api.ts is the contract; sprites/ is the pixel-art API
src/audio/       AudioEngine (Web Audio) — api.ts is the contract
src/ui/          DOM UI; contracts.ts = camp contract; main.ts = app shell
scripts/bot.ts   self-play bot; scripts/sim.ts balance report
```
Imports use explicit `.ts` extensions (Node type stripping). `erasableSyntaxOnly`: no enums / namespaces / parameter properties.

## Run flow
* `new Battle({ save, areaId })`. Phases: `walk` → `fight` (stages 1–9) / `bossIntro` → `fight` (stage 10) → `victory` → (`walk` into next area if Descent) → `ended`.
* Main loop: fixed step 1/60 s × timeScale; each frame `battle.drainEvents()` → renderer.pushEvents, audio.handleEvents, UI.
* Run ends: `wiped` (all heroes dead), `lantern` (timer out), `victory` (boss killed, no descent), `retreat` (player button).
  `battle.result: RunResult` → `applyRunResult(save, result)` returns `Notice[]` (firstClear, recruit, areaUnlock, star, bossRecord, ending, trueEnding, rekindleReady, newRecord).
* **Lantern**: `battle.lantern / lanternMax` seconds. Burns while walking & fighting. Frozen (`battle.lanternFrozen`) during boss intro, victory, ROUT stages, Descent walk, boss untargetable (submerge), 1.2 s after boss phase changes, and walking with Swift March. **Flare**: at boss intro lantern is raised to `area.flare` if lower (event `flare`). **Last Light** node: when it hits 0 once per run, 8 s extra (`battle.lastLightActive`), +40% damage.
* **ROUT**: a non-boss wave the party has clearly outgrown (estimated kill time ≤ 2 s × (1 + area index); elites ≤ 0.5 s × (1 + area index)) resolves with triple-speed heroes, no lantern burn, 0.3 s walk. Event `rout {chain}` → show "ROUT ×N".
* **Descent** (cycle 2+, i.e. `save.prestige >= 1`): killing a boss with ≥ 10 s lantern continues into the next area's stage 1 (+8 s lantern, 2 s walk). Event `descent {area}`. `battle.area` changes mid-run; `battle.segments` records each area.
* **Pity (ランタンの記憶)**: each failed boss attempt reduces that boss's HP **and damage** by 5% (max 20%) until killed (`bossIntro.pity`).
* **Depth Embers**: +1 Ember for every new best stage reached in an area (per cycle; stage 1 is free) — Notice `depth`.
* **Stars**: boss kill with lantern ≥ 0 / ≥ 50% / ≥ 75% left → 1/2/3 stars per area (+2 Embers per new star).
* **Records**: `area.bossFirstTime` / `bossBestTime` → Notice `bossRecord` ("初討伐 41.2s → 今回 3.4s").

## Heroes (unlock order) and actives (hotkeys 1–4)
| Hero | Auto attack | Passive mechanic | Active |
|---|---|---|---|
| Guardian | front target; every 3rd swing = Heavy Swing (160%) | Block (20%: −60% dmg) | **Shield Bash** (8 s): targets the most dangerous *orange* windup, else Mark, else front. 200% + stun. If it cancels an orange windup → **BREAK**: 700% (×2 from the Stagger it applies = 1400%), stun & **Stagger** (damage taken ×2) 1.5 s (bosses 4 s) |
| Ranger | fast arrows, lowest-HP target | Crits; **Mark**: player clicks an enemy → focus (`mark = Infinity`, +20% dmg taken, whole party targets it). Click again to clear. | **Arrow Rain** (14 s): 10 × 55% random arrows |
| Arcanist | Ember Bolt (magic, ignores Armor) | **Burn** stacks (DoT; each stack also shreds 0.15 Armor) | **Meteor** (18 s): 0.8 s delay, 450% magic to all, ×3 vs Ward, +2 Burn |
| Oracle | heals lowest HP% ally, else Smite | Barrier, cleanse | **Sanctuary** (22 s): Barrier 35% max HP (8 s) + heal + cleanse Doom/Freeze/Chill/Poison/Stun |

* **PERFECT cast** (manual casts only; AUTO never): Bash interrupts; Arrow Rain hits ≥ 4 enemies or a stunned one;
  Meteor hits ≥ 3, a Ward, or a stunned enemy; Sanctuary right before a big purple hit / cleanses / party < 50% HP.
  Effect: refunds 40% cooldown, +10 Overdrive, event `perfect {hero}`; with **Emberbond** lights that hero's pip (15 s,
  `skills[h].pip`, event `emberPip`). All 4 pips → **Ember Nova** (event `emberNova`).
* **AUTO** (Battle Instinct node): `skills[h].auto`, toggled via `battle.setAuto(h, on)` and persisted in `save.autoCast`.
  Smart AUTO after Tactical Instinct (rekindled node); smart AUTO casts that meet a PERFECT condition light Emberbond pips (no refund / Overdrive).
* **Overdrive** (cycle 2+): `overdriveGauge` 0–100, `canOverdrive()`, `activateOverdrive()` (Space). 6 s+: ×2 attack speed, ×2 cooldown recovery, +50% damage.
* **Unbroken Vow** (keystone): `guardian.vow` fills from blocked/absorbed damage; at 40% max HP (event `vow {ready:true}`) the next Bash is **Vowbreaker**.
* Hero `unit.level` → `gearTier(level)` (0..5 at Lv 10/25/50/75/100) → visible gear palette upgrade. Each milestone also ×1.5 stats.

## Enemy telegraph grammar (renderer MUST follow)
* `unit.windup` = { ability, total, remaining, interruptible, targetId, weakened }.
  * **ORANGE bar** (`interruptible`) → "Shield Bashで中断！" — ability name shown above the bar.
  * **PURPLE bar** (not interruptible) → absorb with Barrier/Sanctuary. For `nova` / `drainLantern` kinds also pulse a purple screen-edge vignette.
  * `targetId` set for single-target strikes → draw a target line / reticle on that hero.
  * `ability.channelDrain` (Devour the Light) → draining lantern icon; `ability.breakFrac` → show "break" progress (`windup.dealt / (maxHp*breakFrac)`).
  * `windupChange {interruptible:true}` (ward-linked Eclipse after its Ward breaks) → bar flips purple → orange with a flash.
  * `windup.weakened` → cracked bar (Ascendant Guardian).
* **Ward** `unit.ward / maxWard` = teal shield bar over HP (magic ×1.5, Meteor ×3, physical ×0.5). `wardBreak` event.
* **Armor** `unit.armor` (shield icon); `unit.sunder > 0` → armor ignored (crack icon).
* Status fields: `stun`, `stagger`, `mark` (Infinity = player focus, gold; finite = hunt mark, red), `burnStacks`, `chill`, `frozen`,
  `doom {time,total}` (skull + countdown over hero), `dot`, `taunt`, `haste`, `barrier` (+`barrierTime`), `untargetable` (submerged → hide/ripple).
* Bosses: `def.phases` with `bossPhase` event + `phaseText` banner; `enraged`; multi-boss final (4 shadow heroes).

## Events (src/core/types.ts → BattleEvent)
attack (src,dst,fx,travel: projectile/lunge timing) · damage (amount, crit, blocked, absorbed, toWard, big, overkill, tag) ·
heal · barrier · barrierBreak · wardBreak · death · revive · loot (gold/ember/shard at x,y) · skill (hero, auto) · perfect ·
emberPip · fx (meteor, explosion, sanctuary, nova, emberNova, summon, ward, submerge, emerge, drain, revive, benediction, overdrive,
phase, intercede, shockwave, freeze, doom, chain, meteorite, arrowRain) · interrupt · stagger · stun · windup · windupChange ·
ability · text (floating text over unit or screen-center if id null) · wave (stage, elite, boss, routed) · rout · bossIntro ·
bossPhase · bossDefeated (final, time) · eliteDefeated · mark · lantern (low) · flare · lastLight · descent · overdrive (on) ·
vow (ready) · emberNova · heavySwing · runEnd.

World coordinates: 400 × 180, ground line y = 150, units stand at (x, y) = feet; `SIZE_BOX[size]` gives approximate box.
Heroes at x ≈ 60–152 (Guardian front, right-most). Enemies x ≈ 212–378. Flying enemies are 18 px higher.

## Currencies
Gold (levels) · Embers (skill tree) · Relic Shards (relics, cycle 2+). `formatNum()` for display.

## Skill tree
`TREE` nodes with `x,y` in a 1200 × 800 layout, `req` (anyOf / allOf / synergyCount / hero / prestige), `branch`, `kind`
(stat / ability / behavior / synergy / keystone / root), `build` label for synergies. `nodeView(save, id)` →
status: `maxed | upgradable | available | locked | sealed` + `affordable` + `sealReason`. Rekindled nodes (branch `rekindled`)
have no edge to the hub; draw them on the outer rim with a sealed look until prestige ≥ 1.

## Prestige — Rekindle
`canRekindle(save)` after the Hollow Sovereign falls; `rekindleShards(save)` preview; `rekindle(save)` resets gold, levels, area
progress (records kept); keeps tree, heroes, embers, relics. Grants shards, relic slots (2, +1 Relic Socket), Overdrive,
Ember Memory (stats × (1 + 0.0012 × sum of peak levels)), Descent, cycle-2 boss openers, and Area 6 (The Ember Heart) after
re-clearing The Hollow. Relics: `RELIC_LIST`, `buyRelic`, `equipRelic`, `unequipRelic`, `relicSlots`.

## Endings
Notice `ending` (first Hollow Sovereign kill): short ending text + "Rekindle unlocked". Notice `trueEnding` (Hollow
Emberbound): true ending + credits + stats; the game continues (players may keep playing / rekindle again).
