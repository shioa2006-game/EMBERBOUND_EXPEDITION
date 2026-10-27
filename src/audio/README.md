# src/audio — procedural audio engine

Everything is synthesized at runtime with the Web Audio API (no audio files, works offline).
`AudioEngine` (audio.ts) implements `IAudio` (api.ts) and is a silent no-op wherever Web Audio
is unavailable (Node, tests): no method ever throws.

| File | Role |
|---|---|
| `audio.ts` | `AudioEngine`: context lifecycle, mixer graph, settings, rate limits, voice cap, ducking, coin combo |
| `synth.ts` | primitives: pulse waves (12.5% / 25% duty), noise buffer, `tone()` / `noise()`, `Layer` helper |
| `sfx.ts` | one recipe per sound + its limits (`SFX` table): every `SfxName` plus internal extras |
| `events.ts` | `BattleSoundMapper`: `BattleEvent` → sounds, auto music switching, `musicForBattle()` |
| `score.ts` | tiny score format (scale degrees, chord-relative patterns, drum lanes) and its compiler |
| `tracks.ts` | the 11 original chiptune loops (one per `MusicTrack`) |
| `music.ts` | lookahead sequencer (25 ms timer, 120 ms horizon), instruments, drums, crossfading players |

## Mixer graph

```
voices ─► (pan) ─► sfxBus ───────────────┐
track players ─► musicBus ─► duckGain ───┴─► glue compressor ─► limiter (-3 dB, 20:1) ─► master ─► out
```

* `setSettings`: `sfx`/`music` toggles and volumes (`v^1.5` curve, smoothed). Turning music off stops the
  sequencer (CPU); turning it on restarts the requested track.
* Big stingers duck the music (`bossIntro`, `bossPhase`, `bossDefeat`, `victory`, `defeat`, `recruit`,
  `milestone`, `rekindle`, `emberNova`, `descent`, `lastLight`, `lanternOut`).
* The context is suspended while the tab is hidden and resumed when it becomes visible.

## Integration (app shell)

```ts
const audio = new AudioEngine();            // also self-unlocks on the first pointer/key gesture
audio.unlock();                             // call from any click/keydown (idempotent)
audio.setSettings(save.settings);           // whenever settings change
audio.setMusic('title' | 'camp' | areaId | 'boss' | 'finalBoss' | 'ending' | null); // same track = no-op
audio.handleEvents(battle.drainEvents(), battle);  // every frame (after the renderer, same array is fine)
audio.play('uiClick');                      // UI sounds
```

* **Music during runs**: call `setMusic(areaId)` when a run starts. With `audio.autoMusic` (default `true`)
  the engine itself switches to `boss` / `finalBoss` (The Hollow + The Ember Heart) on `bossIntro`, fades to
  silence under the boss fanfare on `bossDefeated`, and to the next area's track on `descent`.
  Shells that prefer to derive the track can set `autoMusic = false` and call
  `setMusic(musicForBattle(battle))` every frame (exported from `audio.ts`).
* UI sounds the shell should play itself: `uiClick`, `uiHover` (very subtle), `uiError`, `runStart`
  (expedition departs), `levelUp` / `milestone` (Lv 10/25/50/75/100), `nodeBuy`, `relic`, `recruit`,
  `rekindle`, and `coin` / `ember` / `shard` if currency pickups are animated outside the battle.
* `setMusic('ending')` on the ending / true-ending screens.

## Limits

* Per sound: max starts per second (e.g. `hit` 18/s, `coin` 12/s, `arrow` 10/s, `crit` 10/s,
  `burnTick` 4/s) and a minimum gap. Some sounds may be pushed back by up to `delay` seconds instead of
  dropped — six coins from one Meteor become a rising 50 ms cascade.
* Global cap of **24** voices; when full, the lowest-priority (then oldest) voice is faded out if the new
  sound has equal or higher priority, otherwise the new sound is dropped. Mix density also attenuates
  new voices gently above 10 active voices.
* `coin`: bright two-tone blip whose pitch climbs a major scale (up to an octave) for consecutive pickups;
  the ladder resets after 0.6 s without a coin.
* Every sound gets a small random pitch variation (`vary` in `sfx.ts`).

## BattleEvent → sound

Stereo position follows the unit's x (heroes left, enemies right).

| Event | Sound |
|---|---|
| `attack` fx `arrow` / `arrowRain` | `arrow` (quiet whoosh; Arrow Rain arrows quieter, higher) |
| `attack` fx `bolt` / `smite` | `bolt` (Smite higher, quieter) |
| `attack` fx `chain`, `fx` `chain` | `chain` zap |
| `attack` fx `enemyShot` / `enemyMagic` | `arrow` / `bolt`, lower and quieter |
| `attack` melee / bash fx | — (the impact carries it) |
| `damage` → hero, `blocked` | `block` (metallic tink) |
| `damage` → hero, fully absorbed by Barrier | `absorb` |
| `damage` → hero, auto hit | `hurt`, louder for bigger chunks of max HP, lower when `big` |
| `damage` → hero, tag `nova` (single strike ability) | heavy `hurt` |
| `damage` → hero, party-wide nova / doom / explode | quiet `hurt` (the `nova` / `doomBlast` / `smallBoom` carries it) |
| `damage` → enemy, `crit` | `crit` (sharper + sparkle) |
| `damage` → enemy, `big` (Heavy Swing, Aegis Retort…) | `hitHeavy` |
| `damage` → enemy, all into Ward | `wardHit` (glass tink) |
| `damage` → enemy, magic | `hitMagic`; physical → `hit` |
| `damage` tag `burn` | `burnTick` (tiny crackle, 4/s) |
| `damage` tag `skill` from Arrow Rain | light `hit` / `crit`; from Shield Bash → — (`bash` contains the slam) |
| `damage` tag `vow` (Vowbreaker) | `hitHeavy`, low |
| `damage` tags `meteor` `explode` `emberNova` `splash` `reflect` `chain` | — (covered) |
| `heal` → hero | `heal` (skipped in the Sanctuary frame); → enemy: `enemyHeal` |
| `barrier` | `barrier` (skipped in the Sanctuary frame) |
| `barrierBreak` | `barrierBreak` (glass shatter) |
| `wardBreak` | `wardBreak` (crystal shatter + bass drop) |
| `interrupt` | `interrupt` (metallic clang + bass drop) |
| `stagger` (not from an interrupt / ward break this frame) | `break` |
| `stun` (not from an interrupt) | `stun` (tiny chirp) |
| `skill` guardian | `bash` (whoosh + shield slam timed to the 0.1 s hit) |
| `skill` ranger | `arrowRain` (volley) |
| `skill` arcanist | `meteorFall` (the impact plays on the scale-2 `fx` explosion, so it follows pause / slow-mo) |
| `skill` oracle | `sanctuary` (choir chord + chimes) |
| AUTO casts | same, 80% volume |
| `perfect` | `perfect` (sparkly chime) |
| `emberPip` on | `pip`, pitched per hero (1-3-5-8 → the four pips form a chord) |
| `windup` interruptible (orange) | `windup` (warning tick) |
| `windup` unstoppable (purple) | `unstoppable` (ominous pulse; louder for nova / drainLantern) |
| `windupChange` → interruptible | `windupFlip` (crack + tick) |
| `ability` strike / nova / doom / freeze / summon | `heavyWhoosh` / `nova` / `doom` / `freeze` / `summon` |
| `ability` ward / wardAllies, healAllies, submerge, drainLantern, buffAllies | `wardUp`, `enemyHeal`, `splash`, `drain`, `empower` |
| `fx` explosion | scale 2 (Meteor landing, `BAL.meteorDelay` after the cast) → `meteorImpact`; otherwise (Combustion / Crystal Mite) → `smallBoom` |
| `fx` meteorite / doom / drain / shockwave | `meteorite` (fall + small impact) / `doomBlast` / `drain` / `shockwave` |
| `fx` benediction / intercede / ward / emerge | `benediction` / `intercede` / `wardUp` / `splash` (higher) |
| `death` enemy normal | `enemyDeath` pop, pitched by size; louder/lower on overkill |
| `death` elite / non-final boss (shadow heroes) | `eliteCrunch` (skipped when `eliteDefeated` / `bossDefeated` plays) |
| `death` hero | `heroDeath` (falling minor line) |
| `revive` | `revive` (enemy phoenix: lower) |
| `loot` gold / ember / shard | `coin` (combo ladder) / `ember` / `shard` |
| `wave` elite (not routed) | `eliteWarn` (low horn) |
| `rout` | `rout`, pitch rises with the chain |
| `bossIntro` | `bossIntro` (+ boss music) |
| `bossPhase` | `bossPhase` (roar sweep) |
| `bossDefeated` | `bossDefeat` (~2 s fanfare chord; music fades out) |
| `eliteDefeated` | `eliteDefeat` (crunch + jingle) |
| `mark` on | `mark` (lock-on blip) |
| `lantern` low | `lanternLow` |
| `flare` | `flare` (fire whoosh) |
| `lastLight` | `lastLight` (heartbeat + rising swell) |
| `descent` | `descent` (+ next area music) |
| `overdrive` on / off | `overdrive` (power surge) / `overdriveEnd` |
| `vow` ready / spent | `vow` (resonant bell) / `break` (Vowbreaker impact) |
| `emberNova` | `emberNova` |
| `heavySwing` | `swing` |
| `runEnd` victory / wiped / lantern / retreat | `victory` / `defeat` / `lanternOut` / `retreat` stingers |
| `text`, `wave` (normal), `fx` others | — |

## Music

| Track | Key / mode | Tempo | Character |
|---|---|---|---|
| `title` | D major, 3/4 | 80 | music-box lantern waltz; flute joins on the repeat |
| `camp` | G major, shuffle | 92 | cozy campfire: flute, strummed pluck, bongos in the B section |
| `ashwood` | A minor (harmonic V) | 112 | warm minor folk, fiddle-like pulse lead, flute harmony |
| `ruins` | D dorian | 100 | watery: echoing soft lead, rippling glass arpeggio, water drops |
| `glimmer` | E lydian | 120 | sparkling bells, crystal chimes |
| `rimeholt` | B minor | 76 | cold & slow, long echo, ice-drop bells, sparse drums |
| `hollow` | E phrygian | 92 | ominous E–F ostinato, dark brass |
| `heart` | D major (♭VII) | 138 | heroic finale, harmonised lead, brass chords |
| `boss` | G minor | 150 | driving octave bass, 16th hats |
| `finalBoss` | C phrygian-dominant | 168 | intense, Neapolitan ♭II, crash every 4 bars |
| `ending` | F major (borrowed iv) | 96 | bittersweet & triumphant |

All loops are 16 bars (23–51 s). `setMusic` crossfades over 0.8 s.
