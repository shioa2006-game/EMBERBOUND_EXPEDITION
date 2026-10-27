# EMBERBOUND EXPEDITION — Game Design Document

> **Note:** this is the original pitch. Final, implemented rules and numbers live in `docs/MECHANICS.md` and `docs/BALANCE.md` (they supersede this file where they differ).

Short Incremental RPG / Party Auto Battler / Light Active RPG.
Target: first clear 45–60 min, full experience incl. Rekindle (prestige) 60–90 min.
Language: Japanese UI text, English proper nouns (classes, skills, areas, relics).

## 0. Fantasy & Tone
The last sacred flame — **the Ember** — is dying. The Hollow, a hungry darkness, swallows the land.
The *Emberbound* carry the Ember in a **Lantern** and descend, again and again, a little deeper each time.
Each expedition is short: the lantern burns out, or the party falls, and they return to camp to grow stronger.

Core feeling: **"Minutes ago this wall crushed me. Now my party deletes it."**

## 1. Core Loop
```
Camp ─► choose Area ─► RUN (15–90s, auto battle + active skills)
  ▲                         │ ends on: party wiped / Lantern out / Boss defeated
  │                         ▼
  └── spend Gold (levels) & Embers (Skill Tree) ◄── Run Result (loot, records, unlocks)
```
* A Run = walk through up to 10 **stages** (waves) of one Area. Stage 5 = **Elite**, stage 10 = **Boss**.
* **Lantern** = run timer (60s base). Burns while walking & fighting; paused during boss intro/celebration.
  Lantern-out = safe retreat with all loot. Prevents stalemates; makes DPS matter.
* Between waves the party walks ~1s and recovers 8% max HP ("Rest").
* All loot is kept on every run end. No punishment for failure — only progress.

## 2. Currencies (3 max)
| Currency | Source | Spent on |
|---|---|---|
| **Gold** | every enemy | Hero levels (per hero, exponential cost) |
| **Embers** | Elites, Bosses, first-clear bonus, (Scavenger node: normal enemies) | Skill Tree nodes |
| **Relic Shards** | Rekindle (prestige), Bosses in cycle ≥2 | Relics (post-prestige) |

## 3. Party (4 heroes, unlocked one by one — each adds a MECHANIC)
| Hero | Joins | Auto attack | Mechanic introduced | Active (key) |
|---|---|---|---|---|
| **Guardian** | start | Sword, front target, slow-ish | **Block** (chance to reduce hit 60%), enemies target him by default, **Interrupt** windups | **Shield Bash** [1] CD 8s: 250% ATK, stun 1.5s, interrupts enemy windups (auto-targets the enemy winding up) |
| **Ranger** | Area 1 boss | Fast arrows, targets lowest-HP enemy | **Critical hits**, **Mark / Focus**: click an enemy to Mark it (+20% dmg taken; party focuses it) | **Arrow Rain** [2] CD 14s: 10 arrows ×55% ATK spread over all enemies, can crit |
| **Arcanist** | Area 2 boss | Ember Bolt (magic) | **Magic ignores Armor**, **Burn** DoT stacks (max 3), shield breaking | **Meteor** [3] CD 18s: 0.8s delay, 450% ATK magic to ALL + 2 Burn; ×3 vs Wards |
| **Oracle** | Area 3 boss | Heals lowest-HP% ally; Smites when nobody is hurt | **Healing**, **Barrier** (absorb shield), cleanse | **Sanctuary** [4] CD 22s: Barrier 35% maxHP to all (8s), heal 15%, cleanse debuffs |

Recruits join at a level near the party's current level so they're instantly impactful.

## 4. Combat Rules
* Real-time, fixed timestep. Each unit has attack interval, ATK, HP, crit chance/mult.
* Damage types: **physical** (reduced by enemy Armor), **magic** (ignores Armor; bonus vs Wards), **true**.
* Statuses: Stun, Mark, Burn (stacks), Chill (slower attacks), Barrier, Ward (enemy shield), Doom (delayed hit; cleansed by Sanctuary / absorbed by Barrier), Frozen (hero can't act).
* **Windups**: telegraphed enemy attacks with a visible charge bar.
  * *Interruptible* (orange bar) → Shield Bash cancels it. "INTERRUPT!"
  * *Unstoppable* (purple bar) → cannot be cancelled; must be absorbed (Barrier/Sanctuary) or out-healed.
* Enemy targeting styles: `front` (Guardian), `backline` (rear heroes), `lowest`, `random`.
* Active skills: cooldowns, hotkeys 1–4, clickable buttons. **Auto-Cast** unlocks via Skill Tree
  (dumb: cast when ready) and later **Tactical Instinct** (smart: interrupts, pre-shields nukes).
* Post-prestige: **Overdrive** gauge [Space] — 6s of double speed, +50% damage, fast cooldowns.

## 5. Areas (10 stages each; stage 5 Elite, stage 10 Boss)
| # | Area | Theme | New enemy mechanic | Boss & pattern |
|---|---|---|---|---|
| 1 | **Ashwood Hollow** | charred forest, floating embers | windups (interrupt), basic melee/ranged | **Gnarlwood, the Smoldering Elder** — *Root Crush* interruptible 5× windup, summons Cinder Saplings, enrage at 50% |
| 2 | **Drowned Ruins** | sunken temple, teal water light | swarms, backline archers, enemy healers (Mark them) | **Coilscale Matriarch** — summons Tideling swarms, *Venom Spit* at backline, *Submerge* (untargetable) → *Crashing Wave* party windup |
| 3 | **Glimmerdeep** | crystal cavern, purple/cyan glow | **Armor** (phys −60%), exploding mites, ward-casters | **Geode Colossus** — *Crystal Carapace* Ward (must break; magic ×1.5, Meteor ×3), *Prismatic Beam* interruptible, *Shard Storm* party hit |
| 4 | **Rimeholt Citadel** | frozen fortress, snowfall | **Unstoppable** party nukes, Chill, Frostbite | **Rimequeen Isveil** — *Absolute Zero* unstoppable party nuke (Sanctuary!), *Frozen Tomb* freezes a hero, *Ice Lances* |
| 5 | **The Hollow** | void abyss, black/violet/sick green | **Doom** marks, Lantern-draining enemies | **The Hollow Sovereign** (final) — 3 phases: cleave+summons → Void Ward + Doom + *Eclipse* nuke → *Devour the Light* (drains Lantern), frenzy |
| 6 | **The Ember Heart** *(cycle 2+)* | burning golden core | revived echoes, phoenixes | **The Hollow Emberbound** — 4 shadow heroes (Shadow Guardian protects others, Shadow Ranger marks & snipes, Shadow Arcanist meteor windup, Shadow Oracle heals/shields). Kill order matters → True Ending |

## 6. Skill Tree (Embers) — numbers + new abilities + behaviour changes + synergies
Hub **Ember Heart** in the center. Expedition (lantern/economy) nodes ring the hub. Four class
branches extend to the corners (Guardian top-left, Ranger top-right, Arcanist bottom-right, Oracle
bottom-left). **Cross-class synergy** nodes sit between branches and need prerequisites from both.
Class branches are visibly locked until the hero is recruited. Rekindled nodes (outer) require prestige.

States: **Owned** (gold, filled), **Available** (glowing, affordable), **Available-but-poor** (cost in red),
**Locked** (prereqs missing, dim), **Sealed** (hero not recruited / prestige required, padlock).

### Expedition
* Kindling (3 ranks) Lantern +8s/rank · Gilded Path (3) Gold +20%/rank · Ember Sense (2) +1 Ember from Elites/Bosses
* Swift March: walking 2× faster, Rest heal ×2 · Scavenger: 10% chance normal enemies drop an Ember
* Second Wind: once per run, a wipe instead revives everyone at 30% HP
* Battle Instinct: unlock Auto-Cast toggles · Tactical Instinct: Auto-Cast becomes smart

### Guardian
Tempered Steel (5) ATK/HP +15% · Shield Wall (3) Block +8% · **Retaliation** block → counter 120% ATK ·
**Shockwave Bash** Bash hits & stuns all · **Provoke** Bash taunts all enemies 3s · **Iron Resolve** interrupt → Bash CD −50%, heal 10% ·
**Juggernaut** (keystone) +1% ATK per 1% missing HP, −40% damage taken below 30% HP

### Ranger
Fletching (5) ATK +15% · Keen Eye (3) Crit +6% / CritDmg +25% · **Twin Shot** crits fire an extra arrow ·
**Hunter's Instinct** every 5th arrow Marks; Mark +10% · **Arrow Storm** +6 arrows, CD −3s ·
**Executioner** +80% vs enemies <35% HP · **Deadeye** (keystone) every 4th crit deals ×4

### Arcanist
Kindled Focus (5) ATK +15% · Wildfire (2) Burn max +2, Burn dmg +25% · **Chain Lightning** every 3rd bolt chains to 3 ·
**Meteor Swarm** +3 meteorites, CD −3s · **Combustion** burning enemies explode on death ·
**Arcane Conduit** chains +2 and apply Burn · **Inferno** (keystone) Burn can crit, ticks 2× faster

### Oracle
Grace (5) Healing/ATK +15%, party HP +5% · **Overflow** overheal → Barrier · **Benediction** every 8s party +25% attack speed 3s ·
**Hallowed Ground** Sanctuary heals more and gives +30% damage · **Resurrection** once per run revive at 50% ·
**Divine Echo** (keystone) Sanctuary echoes at 50% 4s later; Barrier +30%

### Cross-Class Synergies (11)
| Node | Pair | Effect |
|---|---|---|
| Covering Fire | G×R | Guardian blocks → Ranger fires a free arrow at the attacker and Marks it |
| Pinning Volley | G×R | Arrow Rain always crits stunned enemies; Bash stun +0.5s |
| Molten Bash | G×A | Shield Bash applies 3 Burn; stunned enemies take +40% magic damage |
| Spellstrike | R×A | Marked enemies take +40% magic damage; Chain Lightning seeks Marked enemies |
| Kindled Arrows | R×A | Ranger crits apply 1 Burn |
| Aegis Retort | G×O | When the Guardian's Barrier breaks → shockwave 300% ATK to all enemies |
| Pyre of Renewal | A×O | Killing a burning enemy heals party 3% and reduces all cooldowns by 1s |
| Blessed Aim | R×O | Benediction also gives +15% crit; crits heal lowest ally 4% of damage |
| Radiant Meteor | A×O | Meteor grants every hero Barrier 10% per enemy hit (max 40%) |
| Bulwark of Faith | G×O | Sanctuary resets Shield Bash and taunts all enemies onto the Guardian |
| **Emberbond** | all | Use all 4 actives within 8s → **Ember Nova** massive damage + haste |

### Rekindled (prestige ≥1)
Overdrive Mastery · Veteran's Wisdom (Gold ×2, levels cheaper) · Ascendant Guardian/Ranger/Arcanist/Oracle
(class power spike + ability twist, e.g. Bash interrupts Unstoppable) · Relic Socket (+1 relic slot)

## 7. Prestige — "Rekindle"
Unlocked after defeating The Hollow Sovereign. Rekindling:
* **Resets**: Gold, hero levels, area progress.
* **Keeps**: Skill Tree, recruited heroes, Embers, Relics, settings, records.
* **Grants**: Relic Shards, the **Relic** system (2 slots, +1 via node), **Overdrive**, Rekindled tree nodes,
  and Area 6 **The Ember Heart** once Area 5 is re-cleared.

### Relics (build-defining, equip at camp)
Gale Quiver (attack speed build) · Stormhawk Eye (crit build) · Conduit Prism (chain build) · Bastion Heart (barrier-counter build) ·
Ember Crown (burn build) · Phoenix Plume (revive) · Hourglass of Ash (cooldowns) · Lantern of Eternity (lantern/overdrive) ·
Gilded Idol (economy) · Twin Fang (Ranger double shot) · Mirror Aegis (reflect) · Soulbound Chalice (heal → barrier)

## 8. Progression Timeline (target)
| Time | Event |
|---|---|
| 0:00 | Guardian, first run, Shield Bash interrupt tutorial (slow-mo hint) |
| ~1:30 | First Elite → Embers → Skill Tree opens |
| ~5:00 | Gnarlwood defeated → **Ranger** joins (Mark, crits, Arrow Rain) |
| ~10:00 | First synergy affordable |
| ~15:00 | Coilscale defeated → **Arcanist** (armor, burn, Meteor) |
| ~22:00 | Auto-Cast (Battle Instinct) affordable |
| ~30:00 | Geode Colossus defeated → **Oracle** (heal, barrier, Sanctuary) |
| ~40:00 | Rimequeen defeated → The Hollow |
| ~50:00 | **Hollow Sovereign** → Ending → **Rekindle** unlocked |
| 50–70 | Cycle 2: Relics, Overdrive, blitz Areas 1–5 |
| 70–85 | **The Ember Heart** → Hollow Emberbound → True Ending |

Rule: no more than ~5 minutes without a new unlock, node, or mechanic.

## 9. Balance Model (internal; see `src/core/balance.ts`)
Global stage index `s = 10·area + stage` (0..59).
* Enemy HP  `= H0 · gH^s · def.hpMult`, Enemy DMG `= D0 · gD^s · def.dmgMult`
* Gold drop `= G0 · gG^s · def.goldMult`
* Hero stat `= base · gL^(level−1)` · tree/relic multipliers
* Level cost `= C0 · gC^(level−1)`
Tuned with a headless self-play bot (`npm run sim`) so that each wall falls within ~1–3 runs and no
stage needs 10+ attempts. Party additions & keystones are deliberate power spikes.

## 10. Presentation
* Pixel art drawn procedurally from in-code sprite maps (no external images), integer-scaled canvas.
* Hit flash, damage numbers (crit = big gold "!" ), particles, screen shake, interrupt burst,
  coin fountains that fly into the HUD, boss intro banner, boss death slow-mo + explosion + loot rain.
* Web Audio synthesized SFX (attack, crit, block, coin, ember, skill casts, level up, boss defeat) and light chiptune music; SFX/Music toggles.
* UI: header (area, currencies), battle canvas, bottom HUD (party HP/barrier, 4 skill buttons with cooldown sweep + AUTO, lantern bar, stage pips), Camp (Expedition map, Party levels, Skill Tree, Relics), Run Result modal, tutorial hints.

## 11. Save
`localStorage` key `emberbound-save-v1`. Autosave on run end, purchases, settings, every 15s.
Title: Continue / New Game / Reset Save (confirm). Saves: tree, currencies, heroes, levels, area progress,
prestige count, relics, settings, tutorial flags, records.
