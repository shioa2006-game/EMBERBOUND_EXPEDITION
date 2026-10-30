# EMBERBOUND EXPEDITION — Balance Notes

Numbers live in `src/core/balance.ts` (curves & constants) and `src/data/*.ts` (per-enemy, per-area,
per-node, per-relic values). This file records the final tuning, why it is shaped this way, and how to
re-run the self-play bots. `docs/MECHANICS.md` describes the rules; where it quotes a number that changed
here (Bash %, stagger, ROUT threshold, Ember Memory, PERFECT refund), **this file wins** — see §6.

## 1. Tools

| Command | What it does |
|---|---|
| `node scripts/report.ts` | 3 seeds × expert/casual/noskill: per-area table, cycle-2 table, averages, >5 min gaps, Emberbond and Battle Instinct pursuit runs. |
| `node scripts/report.ts --brief --seeds=101,202,303,404,505,606,707,808` | one line of averages per profile — the sweep view. |
| `node scripts/report.ts --relics [--profiles=casual]` | cycle 2 replayed from the same pre-Rekindle saves with **one forced relic** each. |
| `node scripts/report.ts --runs --seeds=202 --profiles=casual` | per-run log (path, end reason, levels, ROUTs, what killed the party). |
| `node scripts/sim.ts --log [--profile=casual] [--seed=N]` | one playthrough with timeline (the original sim; default bot = `DEFAULT_SKILL`). |
| `node scripts/diag.ts --area=rimeholt --when=boss [--levels=2] [--detail]` | freezes the casual's save at an area's first boss attempt and replays N runs per controller: kill rate, damage taken by source, damage dealt by tag, missed windups. |
| `node scripts/par.ts [--seed=N] [--cycle=1]` | per boss, the party-level offset at which each controller wins ≥ 50% (the skill gap in levels). |
| `--set=BAL.enemyGold0=1.5,AREAS.ruins.stageOffset=9,ENEMIES.gnarlwood.abilities.rootCrush.effect.mult=20` | runtime overrides for any script above (`scripts/overrides.ts`; arrays as `[2;3;5]`). |

Profile variants can be passed inline, e.g. `--profiles="casual@interruptRate=1;shieldRate=1;smartRate=1"`
or `--profiles="expert@pursue=[]"` (arrays as `["a"|"b"]`).

### Bot profiles (`scripts/bot.ts` → `PROFILES`)

| profile | windup reaction | purple pre-shield | Mark | smart cooldown use* | spending / AUTO | camp |
|---|---|---|---|---|---|---|
| **expert** (= `DEFAULT_SKILL` + economy) | 75% | 75% | every wave | 100% | saves for Scavenger first; everything manual (PERFECTs) | 9 s |
| **casual** | 50% | 50% | 50% of waves | 50% | saves for Scavenger first; AUTO only once it is smart (Tactical Instinct, cycle 2) | 18 s |
| **noskill** | 0% | 0% | never | 0% | presses actives 1.5–5 s after they light up; greedy spending; never uses AUTO | 12 s |
| autoplay *(info)* | 0% | 0% | never | 0% | noskill that saves for Battle Instinct and runs everything on AUTO | 12 s |
| `expert@pursue=[]` *(robustness check)* | 75% | 75% | every wave | 100% | the legacy bot: greedy spending, weak tree (45%) | 9 s |

\*"smart" = on that cooldown cycle the player holds Shield Bash for the next windup (the bot knows the enemy
rhythm), saves Sanctuary for the next purple hit and fishes for PERFECT Rain/Meteor; otherwise the skill is
pressed 0.15–1.35 s after it lights up. A missed windup is simply not noticed (the player keeps doing what
they would do anyway). Reaction window = last 1.2 s of an orange bar. Human jitter matters: a frame-perfect
masher phase-locks onto boss cadences and interrupts "for free".

## 2. Final results

### Default report (`node scripts/report.ts`, seeds 101/202/303)

```
CYCLE 1 — per area: s=first-run stage  r=runs until boss kill  a=boss attempts  @kill time
profile | seed | Ash                | Ruin               | Glim               | Rime               | Holl               | 1stClr | tree%(n%) | AUTO  | Bond
expert  |  101 | s7 r5 a3 @04:39    | s5 r8 a3 @12:54    | s7 r5 a2 @18:29    | s5 r7 a3 @26:52    | s4 r8 a4 @38:00    | 38:00  |  59%(80)  | 53:07 | 54:29
expert  |  202 | s5 r6 a3 @05:04    | s5 r8 a3 @13:35    | s6 r6 a3 @20:31    | s5 r6 a2 @28:03    | s4 r9 a4 @39:31    | 39:31  |  57%(78)  | 56:36 | 56:36
expert  |  303 | s5 r5 a2 @04:27    | s5 r9 a4 @13:44    | s7 r6 a3 @20:31    | s5 r6 a3 @27:46    | s3 r9 a4 @40:24    | 40:24  |  58%(78)  | 54:46 | 56:23
casual  |  101 | s7 r5 a3 @05:32    | s5 r10 a5 @16:59   | s7 r6 a2 @25:00    | s5 r8 a5 @35:30    | s3 r9 a3 @47:33    | 47:33  |  64%(84)  | 35:30 | 67:18
casual  |  202 | s5 r5 a2 @05:26    | s4 r8 a3 @14:44    | s5 r10 a4 @27:48   | s5 r7 a4 @36:55    | s4 r10 a4 @51:55   | 51:55  |  63%(82)  | 36:55 | 70:21
casual  |  303 | s5 r4 a1 @04:16    | s3 r10 a3 @14:52   | s5 r9 a4 @26:36    | s5 r7 a3 @36:02    | s4 r12 a5 @52:44   | 52:44  |  64%(84)  | 36:02 | 72:16
noskill |  101 | s5 r6 a4 @05:54    | s5 r8 a4 @14:36    | s5 r12 a5 @29:15   | s5 r8 a4 @38:11    | s3 r16 a6 @57:27   | 57:27  |  62%(84)  | 73:54 | 75:25
noskill |  202 | s5 r7 a4 @06:34    | s5 r9 a5 @16:25    | s5 r11 a5 @31:03   | s5 r8 a3 @39:45    | s3 r16 a7 @59:53   | 59:53  |  58%(82)  | 70:10 | 78:35
noskill |  303 | s5 r5 a2 @04:49    | s4 r13 a7 @17:45   | s6 r9 a4 @29:42    | s6 r7 a4 @37:57    | s4 r14 a7 @55:59   | 55:59  |  60%(84)  | 72:42 | 75:57

CYCLE 2 — Δ from Rekindle; first run path (★ = boss killed), area clear times, Heart: first stage / runs / boss attempts
profile | seed | rekindle | first run (routs) | Ash   | Ruin  | Glim  | Rime  | Holl  | Hrt   | Hrt s/r/a | TRUE END | runs | stall       | 25-90s | med
expert  |  101 | 38:00    | Ash★>Ruin10 (8)   | 01:21 | 03:10 | 04:47 | 06:42 | 08:09 | 16:28 | 2/6/4     | 54:29    |   43 | 2 c1 Holl10 |    84% |  64s
expert  |  202 | 39:31    | Ash★>Ruin10 (8)   | 01:25 | 02:54 | 04:23 | 05:26 | 08:30 | 17:04 | 3/6/4     | 56:36    |   46 | 2 c1 Holl10 |    89% |  64s
expert  |  303 | 40:24    | Ash★>Ruin10 (8)   | 01:24 | 03:01 | 04:42 | 06:00 | 08:44 | 15:59 | 4/5/3     | 56:23    |   45 | 2 c1 Ruin5  |    78% |  62s
casual  |  101 | 47:33    | Ash★>Ruin10 (8)   | 01:23 | 03:13 | 05:25 | 07:05 | 08:32 | 19:45 | 1/7/5     | 67:18    |   49 | 3 c1 Ruin10 |    88% |  64s
casual  |  202 | 51:55    | Ash★>Ruin8 (8)    | 01:05 | 02:47 | 04:22 | 07:20 | 08:30 | 18:25 | 1/6/4     | 70:21    |   51 | 3 c1 Glim6  |    86% |  61s
casual  |  303 | 52:44    | Ash★>Ruin10 (8)   | 01:21 | 03:21 | 04:47 | 06:33 | 08:00 | 19:31 | 1/7/4     | 72:16    |   53 | 3 c1 Glim10 |    87% |  63s
noskill |  101 | 57:27    | Ash★>Ruin10 (8)   | 01:22 | 03:38 | 04:50 | 06:36 | 07:43 | 17:58 | 1/8/4     | 75:25    |   62 | 4 c1 Holl10 |    94% |  58s
noskill |  202 | 59:53    | Ash★>Ruin10 (8)   | 01:16 | 03:16 | 04:38 | 06:01 | 09:01 | 18:41 | 2/7/4     | 78:35    |   63 | 6 c1 Holl10 |    89% |  60s
noskill |  303 | 55:59    | Ash★>Ruin10 (8)   | 01:13 | 03:02 | 04:37 | 07:23 | 08:56 | 19:57 | 3/8/4     | 75:57    |   61 | 5 c1 Ruin10 |    92% |  62s

AVERAGES per profile (mm:ss)
profile | Ash kill | Ruin kill | Glim kill | Rime kill | 1stClr | tree% | AUTO  | Holl c2Δ | Heart c2Δ | TRUE END | max gap | gaps>5m
expert  | 04:44    | 13:24     | 19:50     | 27:34     | 39:18  | 58%   | 54:49 | 08:28    | 16:31     | 55:49    | 00:00   | 0
casual  | 05:05    | 15:32     | 26:28     | 36:09     | 50:44  | 64%   | 36:09 | 08:21    | 19:14     | 69:58    | 00:00   | 0
noskill | 05:46    | 16:15     | 30:00     | 38:38     | 57:47  | 60%   | 72:15 | 08:33    | 18:52     | 76:39    | 05:02   | 1
expert is 20% faster than casual (true ending)
noskill is 10% slower than casual (true ending)

GAPS > 5 min without a new node / hero / area / first elite or boss sight / relic (rank-ups not counted)
  noskill  101: 40:07→45:09 (302s after elite hollow)

EMBERBOND pursued (casual): seed 101: bond 47:09  seed 202: bond 49:52  seed 303: bond 49:52
BATTLE INSTINCT (AUTO) pursued from the start (casual): seed 101: 25:08  seed 202: 26:16  seed 303: 25:43
```

### 8-seed averages (`--brief --seeds=101,…,808`)

```
expert   kills[04:42 12:45 19:40 28:07 39:36] 1st[5.8/4.5/5.6/4.8/3.8] att[2.6/3.0/2.8/3.1/3.8] tree 59% | c2 Holl+08:03 Hrt+16:29 s/r/a 2.3/5.9/3.4 | TRUE 56:05 runs 46 stall 4 band 86%
casual   kills[05:15 15:51 26:24 35:57 50:04] 1st[5.8/4.0/5.6/5.5/3.6] att[2.1/3.9/3.3/3.9/4.1] tree 65% | c2 Holl+08:44 Hrt+18:59 s/r/a 2.0/6.3/4.3 | TRUE 69:04 runs 50 stall 3 band 84%
noskill  kills[06:12 16:45 29:32 39:41 57:52] 1st[5.0/4.9/5.5/5.1/3.8] att[3.4/5.1/4.0/4.4/6.4] tree 59% | c2 Holl+08:55 Hrt+20:37 s/r/a 1.9/8.5/4.0 | TRUE 78:30 runs 63 stall 6 band 91%
autoplay kills[05:48 15:50 29:22 38:57 52:22] 1st[5.0/4.8/5.1/5.5/4.4] att[2.6/3.9/4.3/4.6/4.6] tree 69% | c2 Holl+07:58 Hrt+16:52 s/r/a 2.5/6.0/4.1 | TRUE 69:15 runs 55 stall 5 band 87%
legacy   kills[04:39 12:53 20:48 30:09 45:16] 1st[5.8/4.8/5.3/5.0/3.6] att[3.0/4.1/3.1/4.0/5.3] tree 49% | c2 Holl+08:41 Hrt+22:17 s/r/a 1.5/9.4/3.4 | TRUE 67:33 runs 54 stall 6 band 84%
```
`kills` = Gnarlwood / Coilscale / Geode / Rimequeen / Hollow Sovereign · `1st` = stage reached by the first run in
each area · `att` = boss attempts until the kill · `stall` = longest streak of runs that did not push the frontier ·
`band` = runs lasting 25–90 s · legacy = `expert@pursue=[]`.

### Relics — cycle 2 with a single forced relic (casual, 6 seeds, Δ from Rekindle)

```
relic              | cost | Holl Δ | Heart Δ | Hrt att | runs c2
(none)             |    0 | 09:39  | 25:30   |     4.2 |    15.0
gale_quiver        |    6 | 08:48  | 21:46   |     4.2 |    12.8
stormhawk_eye      |    7 | 09:30  | 20:17   |     3.3 |    13.0
conduit_prism      |    7 | 08:54  | 21:49   |     3.8 |    13.7
bastion_heart      |    7 | 09:33  | 22:27   |     4.5 |    12.5
ember_crown        |    7 | 08:51  | 20:44   |     3.5 |    12.8
phoenix_plume      |    6 | 10:20  | 22:43   |     4.7 |    11.3
hourglass_ash      |    6 | 09:30  | 22:09   |     4.3 |    12.3
lantern_eternity   |    5 | 08:44  | 23:07   |     3.7 |    14.0
gilded_idol        |    5 | 08:40  | 22:05   |     4.0 |    12.5
twin_fang          |    6 | 08:30  | 23:17   |     4.2 |    14.5
mirror_aegis       |    6 | 09:32  | 23:06   |     4.8 |    12.8
soulbound_chalice  |    6 | 09:12  | 22:04   |     4.2 |    12.2
```
Every relic is 9–20% faster than none; best/worst spread 1.15×.

### Skill gap in levels (`node scripts/par.ts`, seeds 101 / 202)

Level offset (vs the casual's first boss attempt) at which each controller kills the boss ≥ 50% of the time:
```
area     |  perfect |   expert |   casual |  noskill
ashwood  |   +0/+0  |   +2/+2  |   +0/+0  |   +2/+2
ruins    |   +3/+4  |   +3/+4  |   +3/+4  |   +3/+4
glimmer  |   -3/+1  |   -1/+1  |   +4/+5  |   +5/+7
rimeholt |   +2/+1  |   +3/+2  |   +5/+3  |   +7/+6
hollow   |   +2/+2  |   +2/+3  |   +3/+2  |   +5/+5
```

## 3. Targets vs. results (casual unless noted; 8-seed averages)

| Target | Result |
|---|---|
| Run 1 ends around Ashwood stage 4–6 | 5–7 (avg 5.8) ✓ |
| Gnarlwood 4–6 · Coilscale 12–16 · Geode 22–28 · Rimequeen 32–38 · Hollow Sovereign (first clear) 45–55 min | 5:15 · 15:51 · 26:24 · 35:57 · 50:04 ✓ |
| Each boss within 1–4 attempts | 2.1 / 3.9 / 3.3 / 3.9 / 4.1, Heart 4.3 (single seeds up to 5; boss pity −5%/fail caps it) ~✓ |
| No stage needs ≥ 8 consecutive runs | casual ≤ 3, expert ≤ 4, noskill ≤ 6, legacy bot ≤ 6 ✓ |
| Most runs last 25–90 s | 84–91% of runs, median ~60–65 s ✓ |
| Never > 5 min without a new node / hero / area / mechanic | casual: 0–2 gaps per 8 seeds, ≤ 6 min, always with a rank-up inside ✓ |
| New area's first run ends around stage 3–7 | 4.0–5.8 per area ✓ (the Heart is first reached by a Descent at the end of a long run and dies at stage 1–3; the first dedicated Heart run reaches ~5–6) |
| Later runs show ROUTs on early stages | repeat runs ROUT early waves in Ashwood/Ruins/Glimmer; the first cycle-2 run ROUTs 8 waves ✓ |
| Rekindle: Ashwood blitzed on run 1; Descent covers several areas | first cycle-2 run is `Ash★>Ruin10` with 8 ROUTs, every later run kills a boss and descends ✓ |
| Hollow re-cleared ≈ 10–15 min after Rekindle | **8–9 min** ✗ (see §5) |
| Area 6 (The Ember Heart) is a real challenge | ~6 runs and ~4 boss attempts, ~10 min (casual); hardest wall in the game per run ✓ |
| True ending ≈ 70–85 min (60–90 acceptable) | 69:04 (8 seeds) / 69:58 (default 3) ✓ |
| ~55–70% of the cycle-1 tree at the first clear | 63–65% of the ember cost (82–84% of the nodes) ✓ |
| Battle Instinct (AUTO) affordable ~20–30 min | 25–26 min when saved for ✓ |
| Emberbond ≈ 40–55 min if pursued | 47–50 min ✓ |
| Expert ≈ 25–35% faster | 19–20% (true ending), 21% (first clear), 10–20% per boss ✗ (see §5) |
| No-skill ≥ 20% slower but still finishes | 10–14% (true ending), 14–16% (first clear); finishes at 75–79 min, never stuck ✗/✓ (see §5) |
| Every relic viable | all 9–20% better than none, 1.15× spread ✓ |
| Ember Memory + relics make cycle 2 dramatically faster but not trivial | Hollow re-clear ~6× faster than the first clear; the Heart still takes ~10 min ✓ |

## 4. What changed and why

### Curves (`balance.ts`)
| constant | before → after | why |
|---|---|---|
| `enemyGold0` | 2.2 → **1.45** | fewer levels per run at walls (~1–1.5 instead of 2.5+): walls cost runs, so skill, relics and tree choices show up in time instead of being erased by one extra run. |
| `levelCostGrowth` | 1.168 → **1.18** | gold per stage grows slower than level cost (1.168 vs 1.18): later walls are stickier; Rimeholt/Hollow were far too fast. |
| `memoryPerLevel` | 0.01 → **0.0012** | 0.01 gave ×3.3 stats after Rekindle and turned Area 6 into a two-run stroll. Now ×~1.3 (Σ peak levels ≈ 250); the full tree, relics and Descent still make cycle 2 ~6× faster. |
| `routThreshold` / `Elite` | 1.0 / 0.33 s → **2.0 / 0.5 s** | with the slower economy nothing ever ROUTed after Ruins; replayed early stages now visibly get crushed. |
| `eliteEmbers` | [2,3,4,5,6,8] → **[2,3,5,7,9,12]** | mid/late ember droughts (5–10 min without any purchase). |
| `bossEmbers` | [6,9,12,15,20,30] → **[6,9,12,16,22,30]** | same. |
| `bashMult` / `bashBreakMult` | 2.5 / 5 → **2.0 / 7** | a plain Bash is weaker, an interrupt (BREAK) much stronger: rewards timing over mashing. |
| `staggerMult` / `staggerTimeBoss` | 1.5 / 2.5 s → **2.0 / 4 s** | a boss BREAK opens a 4 s double-damage window (ward and channel breaks too): the DPS payoff of skill. |
| `perfectRefund` | 0.3 → **0.4** | manual PERFECT casts clearly beat dumb AUTO. |
| unchanged | heroGrowth 1.115, milestones ×1.5, pity 5%/20%, lantern 60 s, Descent | tried heroGrowth 1.12 + milestones ×1.35 to soften the L50 "milestone snap" — no better, and UI text says ×1.5. |

### Areas (`areas.ts`)
`stageOffset`: Ruins 3 → **9**, Glimmer 6 → **13**, Rimeholt 9 → **17**, Hollow 12 → **23**, Heart 20 → **26**.
Each recruit is a large power spike (Ranger, Arcanist, Oracle join at 90% of the party level), so the next
area must start much harder for its first run to end at stage 4–6 instead of strolling to the boss. Offsets
stay non-decreasing with depth (tests rely on it).

### Enemies (`enemies.ts`)
* **Damage budget moved from autos to telegraphs.** Bosses and elites have 25–50% lower `dmg`; their orange
  (interruptible) strikes and purple novas have 1.5–3× higher `mult`. Unhandled telegraphs are what wipe a
  party; autos are chip damage. Gnarlwood 1.8 → 1.3 dmg, Root Crush 9 → 20 (~65% of the solo Guardian's HP at
  par); Rimequeen 1.7 → 0.9 dmg, Ice Lances (unavoidable) 1.3 → 0.8, Absolute Zero 3.4 → 8 (a Sanctuary check);
  Hollow Sovereign 1.9 → 1.35 dmg, Umbral Cleave 7 → 13, Eclipse 3 → 5.5, Mark of Doom 4 → 7, Devour 1.6 → 2.2;
  elites' Gore Charge / Tidebreaker / Abyssal Rend 5 → 9, Prism Beam 5 → 8, Frost Bash 4 → 7, Avalanche 2.6 → 3.5,
  Shadow Pulse 2 → 3.5.
* **Coilscale's Venom Spit** was an instant, unavoidable backline strike + DoT (the #1 killer in Ruins and not a
  skill check). It is now an **orange 1.6 s windup** (mult 3.5, cd 9 s, first at 3 s): Ruins teaches "Bash the
  spit". Crashing Wave 1.2 → 3.5 (+35% per Tideling): clear the swarm before it lands.
* **First windup timing.** Root Crush (6 → 4 s) and Prismatic Beam (6 → 4.5 s) now land before a Bash spent at
  the start of the fight is back; with the old timings a button-masher phase-locked onto the boss cycle.
* **Boss HP vs. approach.** Boss `hp` cut (Gnarlwood 30 → 19, Coilscale 34 → 20, Geode 38 → 20, Rimequeen 42 → 14,
  Sovereign 52 → 36) while the offsets went up: areas take the target time, but more of it is spent pushing
  stages 1–9 and fewer runs are failed boss attempts (target 1–4).
* **Elites** slightly lighter (Coral 7.5 → 6.5, Sentinel 8 → 5.5, Warden 8.5 → 6, Herald 9 → 7): being stuck at
  stage 5 of a new area meant runs with zero embers.
* **Mark targets matter more:** Siren heal 0.3 → 0.4, Geomancer ward 0.4 → 0.6, Gloom Caster Doom 3 → 4,
  Lantern Eater drain 1.5 → 2.5 s per hit.
* **The Ember Heart** (offset 26): echoes have ~6× HP / ~3.3× damage of their old values and ~⅓ of the gold
  (Ashen Echo 9 / 4 / 0.43); the shadow party ~11× HP / ~3.4× damage (Shadow Guardian 220 / 5.1); Ember Tyrant
  48 / 6.3 (Searing Brand 4 → 5, Flame Wave 2.2 → 2.5); Dark Meteor 2.8 → 2.2 and Deathmark 7 → 5.5 so a party that
  cannot interrupt can still out-level them. Deep stages pay a lot of gold relative to level costs, hence the low
  gold multipliers. An earlier "sponge" version (≈30× HP at offset 20) soft-locked weak builds at Heart stage 1
  (zero-gold wipe loops for 30+ runs with the legacy bot), so stage 1 is now beatable by any party that just
  killed the Hollow Sovereign, and the boss is the wall.

### Tree (`tree.ts`)
Battle Instinct 20 → **25** (AUTO at ~25 min instead of ~16 when saved for), Emberbond 45 → **70**
(~48 min if pursued). Rekindled node costs are unchanged — the Ascendants gate the Heart hard, and raising them to
30–40 made casual runs stall 15+ runs in Area 6.

### Relics (`relics.ts`)
Gold dominates an incremental, so **Gilded Idol** (gold ×2) was by far the best relic, and survival-only relics
(Phoenix, Lantern, Mirror, Chalice, Bastion) were worth nothing measurable because walls are DPS/lantern bound.
Costs ×~1.4 (5–7 shards: Rekindle's 13 shards now buy 2 relics, the rest come from cycle-2 boss kills).
Effects: Gilded Idol gold ×2 → ×1.2, embers +50% → +20%; Stormhawk crit dmg +100% → +60%; Hourglass CD −40% → −30%;
Gale Quiver ×1.6 speed / −20% dmg → ×1.8 / −10%; Conduit Prism +chain dmg 90% and Arcanist ATK +50%; Bastion Heart
wave Barrier 25% → 30%, Barrier +25%, damage +20%; Phoenix Plume +30% HP and +20% damage; Lantern of Eternity
+30 s → +20 s lantern, Overdrive gain ×1.5 → ×2 and +3 s duration; Twin Fang Ranger ATK +20%; Mirror Aegis reflect
60% → 150%, Block +15% → +25%; Soulbound Chalice heal ×1.8 → ×2, overflow cap 60% → 80%, damage +20%. All `desc`
strings updated to match.

### Heroes (`heroes.ts`)
Shield Bash description: 200% / BREAK 700% + 被ダメージ2倍 (was 250% / 500% + 50%).

### Code
No changes to `battle.ts`, `state.ts`, `mods.ts` or `types.ts`. (A ±20% jitter on enemy ability cooldowns was
tried and reverted; human-like jitter in the bots handles the phase-locking issue instead.)

## 5. Known limits & why

* **Expert lead 19–21% (target 25–35%).** Every skill edge compresses into "a few levels" (each level ×1.115 HP
  and ATK, milestones ×1.5), and at a wall the casual gains ~1–1.5 levels per run, so a 2–5 level par gap costs
  1–3 runs. Embers are paid per run (elites, bosses), so slower players finish cycle 1 with *more* tree (casual
  64% vs expert 58%), and in cycle 2 the casual's smart AUTO (Tactical Instinct) is as reliable as an expert.
  The expert's lead comes from camp time and the cycle-1 walls. Stronger levers exist (much deadlier telegraphs,
  slower leveling) but they push casual boss attempts past 4 and create hard stalls for weaker builds.
* **No-skill gap 10–16% (target ≥ 20%).** Same compression, plus AUTO-free lazy pressing still catches some
  windups. The noskill bot is ~20–30% slower in Glimmer and the Hollow (+2–4 levels of par, ~6 Sovereign
  attempts) but earns more embers on the way and is barely slower in cycle 2. Versions with a
  lethal, interrupt-heavy Heart reached +20–29% but soft-locked weak builds, which is worse. A no-skill player who
  buys Battle Instinct (`autoplay`) finishes at about the casual's pace — AUTO is the accessibility path.
* **Hollow re-clear 8–9 min (target 10–15).** Cycle 2 kills one boss per run and descends; the boss Flare
  always leaves > 10 s of lantern, so Descent never fails, and Memory/Veteran's Wisdom/relic tweaks move it by
  < 1 min. The time was put into the Heart instead, so the true ending still lands at ~69–70 min.
* **Heart first contact** is the Descent arrival at the end of the Sovereign run and usually dies at stage 1–3.
* Bot pacing depends on its spending heuristics: with the same reflexes, a player who never prioritises the
  ember economy (the legacy bot) is ~14% slower to the first clear and ~20% slower overall than the expert, but
  never stalls (≤ 6 runs).

## 6. Doc sync needed (`docs/MECHANICS.md`, UI copy owned by other agents)

* Shield Bash 250% → **200%**; BREAK 500% → **700%**; Stagger "+50% damage taken" → **+100% (×2)**; boss
  stagger 2.5 s → **4 s** (ward-break / channel-break stagger is 3 s, also ×2).
* ROUT: "kill time ≤ 1 s; elites ≤ 0.33 s" → **≤ 2 s; elites ≤ 0.5 s**.
* Ember Memory: "× (1 + 0.01 × sum of peak levels)" → **× (1 + 0.0012 × sum of peak levels)**.
* PERFECT refund 30% → **40%** of the cooldown.
* Coilscale *Venom Spit* is now an **orange, interruptible 1.6 s windup** (was instant).
* Relic tooltips read `RELICS[id].desc` (updated) — any hard-coded relic numbers or costs elsewhere must follow.

## 7. Playtest follow-up (2026-10-30)

Two human playthroughs (one normal ending, one true ending; slow input of 10–25 s per action) both spent
13 runs in Glimmerdeep, the longest stretch of either run, with the same story: the Arcanist — the only
magic damage against armor and wards — died early and the rest of the run went nowhere, and runs stuck at
stage 4–5 paid ~0 embers. Measured per missed interrupt, at the level players meet each strike:

| strike | target | before | after |
|---|---|---|---|
| Root Crush (Gnarlwood, Lv 9) | front | 96% of max HP | — |
| Tidebreaker / Venom Spit (Ruins, Lv 12 / 19) | front / back | 84% / 60% | — |
| **Prism Beam** (Prism Sentinel, Lv 24) | back | **411%** | **154%** (92% at Lv 25, 67% at Lv 28) |
| **Prismatic Beam** (Geode Colossus, Lv 31) | back | **280%** | **124%** |

Glimmer was the one place where a missed interrupt deleted a backliner outright before the Oracle (Barrier)
joins. Prism Beam mult **8 → 3**, Prismatic Beam **9 → 4**: past the Lv 25 milestone the Arcanist survives a
missed beam at full HP, while an interrupt still earns BREAK and stagger. Pacing is unchanged (6 seeds,
casual first clear 40:15 → 40:52, true ending ≈ 54–56 min, all within seed noise); the casual's first Geode
attempt wins 7/30 instead of 3/30 and its deaths move to Shard Storm (the purple nova). Global enemy HP and
rewards were deliberately left alone: in the playtest, more total embers did not shorten Glimmer.
