import type { EnemyDef } from '../core/types.ts';

// hp / dmg / gold are multipliers on the global stage curves in core/balance.ts.
// Ability strike/nova `mult` multiplies the unit's hit damage.
// Telegraph grammar: interruptible windups (orange) can be cancelled by Shield Bash;
// non-interruptible (purple) must be absorbed with Barrier / Sanctuary or out-healed.
// Cadence rule: lethal checks repeat no faster than their counter's cooldown + 2s.
// Damage budget (docs/BALANCE.md): bosses/elites hit softly with auto attacks and hard with telegraphs,
// so interrupting (orange) and shielding (purple) is what decides a wall, not raw levels alone.
// A boss's first orange windup lands before a Bash used at the start of the fight is back (no free
// interrupts for button mashing).

const list: EnemyDef[] = [
  // ───────────────────────── Area 1: Ashwood Hollow ─────────────────────────
  { id: 'ash_crawler', name: 'Ash Crawler', sprite: 'ash_crawler', rank: 'normal', size: 'small', hp: 1.0, dmg: 1.0, gold: 1.0, interval: 1.6, attack: 'melee', target: 'front', desc: '灰を纏った甲虫。' },
  { id: 'ember_wisp', name: 'Ember Wisp', sprite: 'ember_wisp', rank: 'normal', size: 'small', hp: 0.6, dmg: 0.8, gold: 0.9, interval: 1.8, attack: 'magic', target: 'random', flying: true, desc: '漂う火の玉。後衛も狙う。' },
  { id: 'char_wolf', name: 'Charwolf', sprite: 'char_wolf', rank: 'normal', size: 'medium', hp: 0.8, dmg: 0.85, gold: 1.0, interval: 1.1, attack: 'melee', target: 'front', desc: '素早い焦げ狼。' },
  {
    id: 'ash_brute', name: 'Ash Brute', sprite: 'ash_brute', rank: 'normal', size: 'medium', hp: 1.8, dmg: 1.0, gold: 1.6, interval: 2.0, attack: 'melee', target: 'front',
    abilities: [{ id: 'heavySwing', name: 'Heavy Swing', cooldown: 9, initialDelay: 2.0, windup: 2.0, interruptible: true, effect: { kind: 'strike', mult: 4, target: 'front' } }],
    desc: 'オレンジの溜め攻撃「Heavy Swing」。Shield Bashで中断できる。',
  },
  { id: 'cinder_sapling', name: 'Cinder Sapling', sprite: 'cinder_sapling', rank: 'normal', size: 'small', hp: 0.5, dmg: 0.6, gold: 0.25, interval: 1.6, attack: 'melee', target: 'front', desc: 'Gnarlwoodが呼ぶ苗木。' },
  {
    id: 'thornback', name: 'Thornback Boar', sprite: 'thornback', rank: 'elite', size: 'large', hp: 7, dmg: 1.2, gold: 5, interval: 1.8, attack: 'melee', target: 'front',
    abilities: [{ id: 'goreCharge', name: 'Gore Charge', cooldown: 10, initialDelay: 3, windup: 2.2, interruptible: true, effect: { kind: 'strike', mult: 9, target: 'front' } }],
    desc: 'エリート。突進「Gore Charge」は中断可能。',
  },
  {
    id: 'gnarlwood', name: 'Gnarlwood', sprite: 'gnarlwood', rank: 'boss', size: 'huge', hp: 19, dmg: 1.3, gold: 18, interval: 2.0, attack: 'melee', target: 'front',
    enrageBelow: 0.5, opener: 'hollowDoom',
    abilities: [
      { id: 'rootCrush', name: 'Root Crush', cooldown: 10, initialDelay: 4, windup: 2.5, interruptible: true, effect: { kind: 'strike', mult: 20, target: 'front' } },
      { id: 'saplingCall', name: 'Sapling Call', cooldown: 14, initialDelay: 8, windup: 0.8, interruptible: false, effect: { kind: 'summon', enemy: 'cinder_sapling', count: 2, max: 4 } },
      { id: 'hollowDoom', name: 'Hollow Curse', cooldown: 9999, windup: 1.2, interruptible: true, manual: true, cycle2: true, effect: { kind: 'doom', mult: 4, count: 2, delay: 5 } },
    ],
    desc: '「くすぶる古老」。Root Crush（オレンジ）は必ず中断せよ。HP50%で攻撃が加速。',
  },

  // ───────────────────────── Area 2: Drowned Ruins ─────────────────────────
  { id: 'reef_lurker', name: 'Reef Lurker', sprite: 'reef_lurker', rank: 'normal', size: 'medium', hp: 1.6, dmg: 0.9, gold: 1.2, interval: 1.8, attack: 'melee', target: 'front', desc: '頑丈な甲殻蟹。' },
  { id: 'tideling', name: 'Tideling', sprite: 'tideling', rank: 'normal', size: 'small', hp: 0.45, dmg: 0.5, gold: 0.45, interval: 1.2, attack: 'melee', target: 'front', desc: '群れで襲う小魚人。範囲攻撃で一掃しよう。' },
  { id: 'drowned_archer', name: 'Drowned Archer', sprite: 'drowned_archer', rank: 'normal', size: 'medium', hp: 0.8, dmg: 1.1, gold: 1.1, interval: 2.0, attack: 'ranged', target: 'backline', desc: '後衛を狙う亡霊弓兵。' },
  {
    id: 'siren', name: 'Siren', sprite: 'siren', rank: 'normal', size: 'medium', hp: 0.9, dmg: 0.6, gold: 1.4, interval: 2.2, attack: 'magic', target: 'random',
    abilities: [{ id: 'tidalHymn', name: 'Tidal Hymn', cooldown: 6, initialDelay: 3, windup: 1.4, interruptible: true, effect: { kind: 'healAllies', amount: 0.4 } }],
    desc: '仲間を回復する。クリックでMarkして優先して倒そう。',
  },
  {
    id: 'coral_knight', name: 'Coral Knight', sprite: 'coral_knight', rank: 'elite', size: 'large', hp: 5, dmg: 1.2, gold: 5, interval: 1.9, attack: 'melee', target: 'front', protector: 0.2,
    abilities: [{ id: 'tidebreaker', name: 'Tidebreaker', cooldown: 10, initialDelay: 3, windup: 2.2, interruptible: true, effect: { kind: 'strike', mult: 7, target: 'front' } }],
    desc: 'エリート。生存中、他の敵の被ダメージ-20%。',
  },
  {
    id: 'coilscale', name: 'Coilscale Matriarch', sprite: 'coilscale', rank: 'boss', size: 'huge', hp: 20, dmg: 1.1, gold: 18, interval: 1.7, attack: 'melee', target: 'front',
    phases: [0.66, 0.33], phaseText: ['女王が水底へ潜った――群れと大波が来る！', 'ふたたび潜航！ 大波に備えよ！'], phaseAbility: 'submerge', opener: 'submerge',
    abilities: [
      { id: 'tidalCall', name: 'Tidal Call', cooldown: 15, initialDelay: 5, windup: 0.6, interruptible: false, effect: { kind: 'summon', enemy: 'tideling', count: 3, max: 5, hpMult: 0.4 } },
      { id: 'venomSpit', name: 'Venom Spit', cooldown: 9, initialDelay: 3, windup: 1.6, interruptible: true, effect: { kind: 'strike', mult: 3.5, target: 'backline', dot: { dps: 0.4, duration: 5 } } },
      { id: 'submerge', name: 'Submerge', cooldown: 9999, windup: 0, interruptible: false, manual: true, effect: { kind: 'submerge', duration: 4, then: 'crashingWave', summon: { enemy: 'tideling', count: 4, hpMult: 0.4 } } },
      { id: 'crashingWave', name: 'Crashing Wave', cooldown: 9999, windup: 2.5, interruptible: false, manual: true, effect: { kind: 'nova', mult: 3.5, perAlly: { enemy: 'tideling', mult: 0.5 } } },
    ],
    desc: '潜航すると群れを連れて浮上し、大波（紫）を放つ。群れが多いほど大波は強力――Arrow Rainで減らせ！',
  },

  // ───────────────────────── Area 3: Glimmerdeep ─────────────────────────
  { id: 'shardback', name: 'Shardback', sprite: 'shardback', rank: 'normal', size: 'medium', hp: 1.8, dmg: 0.9, gold: 1.4, interval: 2.0, attack: 'melee', target: 'front', armor: 0.6, desc: '装甲60%。物理ダメージを大きく軽減。魔法とBurnが有効。' },
  { id: 'gem_bat', name: 'Gem Bat', sprite: 'gem_bat', rank: 'normal', size: 'small', hp: 0.55, dmg: 0.7, gold: 0.7, interval: 1.0, attack: 'melee', target: 'random', flying: true, desc: '素早い宝石蝙蝠。' },
  { id: 'crystal_mite', name: 'Crystal Mite', sprite: 'crystal_mite', rank: 'normal', size: 'small', hp: 0.6, dmg: 0.6, gold: 0.7, interval: 1.6, attack: 'melee', target: 'front', explodeOnDeath: 0.9, desc: '倒すと爆発し、味方全体にダメージ。' },
  {
    id: 'geomancer', name: 'Geomancer', sprite: 'geomancer', rank: 'normal', size: 'medium', hp: 1.0, dmg: 0.8, gold: 1.5, interval: 2.2, attack: 'magic', target: 'random',
    abilities: [{ id: 'crystalWard', name: 'Crystal Ward', cooldown: 8, initialDelay: 2, windup: 1.4, interruptible: true, effect: { kind: 'wardAllies', amount: 0.6 } }],
    desc: '仲間に結晶シールドを張る。シールドは魔法で砕ける。',
  },
  {
    id: 'prism_sentinel', name: 'Prism Sentinel', sprite: 'prism_sentinel', rank: 'elite', size: 'large', hp: 5.5, dmg: 1.3, gold: 5, interval: 2.0, attack: 'magic', target: 'random', armor: 0.5, ward: 0.5,
    abilities: [{ id: 'prismBeam', name: 'Prism Beam', cooldown: 10, initialDelay: 3, windup: 2.2, interruptible: true, effect: { kind: 'strike', mult: 8, target: 'backline' } }],
    desc: 'エリート。装甲とシールドを持つ。',
  },
  {
    id: 'geode_colossus', name: 'Geode Colossus', sprite: 'geode_colossus', rank: 'boss', size: 'huge', hp: 20, dmg: 1.3, gold: 18, interval: 2.2, attack: 'melee', target: 'front', armor: 0.5, ward: 0.6,
    phases: [0.5], phaseText: ['結晶が砕け、Crystal Miteが溢れ出す！'], opener: 'miteSwarm',
    abilities: [
      { id: 'carapace', name: 'Crystal Carapace', cooldown: 20, initialDelay: 16, windup: 1.5, interruptible: false, effect: { kind: 'ward', amount: 0.5 } },
      { id: 'prismaticBeam', name: 'Prismatic Beam', cooldown: 10, initialDelay: 4.5, windup: 2.4, interruptible: true, effect: { kind: 'strike', mult: 9, target: 'backline' } },
      { id: 'shardStorm', name: 'Shard Storm', cooldown: 14, initialDelay: 9, windup: 2.5, interruptible: false, effect: { kind: 'nova', mult: 1.4, wardScale: 2 } },
      { id: 'miteSwarm', name: 'Mite Swarm', cooldown: 14, initialDelay: 1, windup: 0.5, interruptible: false, minPhase: 1, effect: { kind: 'summon', enemy: 'crystal_mite', count: 2, max: 4 } },
    ],
    desc: '結晶シールドが残っているほど「Shard Storm」（紫）が強力。Meteorで砕け！',
  },

  // ───────────────────────── Area 4: Rimeholt Citadel ─────────────────────────
  { id: 'frost_revenant', name: 'Frost Revenant', sprite: 'frost_revenant', rank: 'normal', size: 'medium', hp: 1.6, dmg: 1.2, gold: 1.4, interval: 1.9, attack: 'melee', target: 'front', armor: 0.25, desc: '凍てついた騎士。' },
  { id: 'rime_archer', name: 'Rime Archer', sprite: 'rime_archer', rank: 'normal', size: 'medium', hp: 0.8, dmg: 0.9, gold: 1.1, interval: 1.8, attack: 'ranged', target: 'backline', chillOnHit: 2, desc: '後衛を狙い、Chill（攻撃速度低下）を与える。' },
  {
    id: 'ice_wraith', name: 'Ice Wraith', sprite: 'ice_wraith', rank: 'normal', size: 'medium', hp: 0.9, dmg: 0.6, gold: 1.3, interval: 2.0, attack: 'magic', target: 'random', flying: true,
    abilities: [{ id: 'blizzard', name: 'Blizzard', cooldown: 10, initialDelay: 4, windup: 1.8, interruptible: false, effect: { kind: 'nova', mult: 1.0, chill: 2 } }],
    desc: '中断不可（紫）の全体攻撃「Blizzard」。Barrierで受けよう。',
  },
  { id: 'frost_hound', name: 'Frost Hound', sprite: 'frost_hound', rank: 'normal', size: 'medium', hp: 0.7, dmg: 0.9, gold: 0.9, interval: 1.1, attack: 'melee', target: 'lowest', desc: 'HPの低い味方を狙う猟犬。' },
  {
    id: 'glacial_warden', name: 'Glacial Warden', sprite: 'glacial_warden', rank: 'elite', size: 'large', hp: 6, dmg: 1.3, gold: 5, interval: 2.0, attack: 'melee', target: 'front', armor: 0.3,
    abilities: [
      { id: 'avalanche', name: 'Avalanche', cooldown: 24, initialDelay: 5, windup: 2.6, interruptible: false, effect: { kind: 'nova', mult: 3.5 } },
      { id: 'frostBash', name: 'Frost Bash', cooldown: 10, initialDelay: 2.5, windup: 1.6, interruptible: true, effect: { kind: 'strike', mult: 7, target: 'front' } },
    ],
    desc: 'エリート。中断不可の「Avalanche」はSanctuaryで防げ。',
  },
  {
    id: 'rimequeen', name: 'Rimequeen Isveil', sprite: 'rimequeen', rank: 'boss', size: 'huge', hp: 14, dmg: 0.9, gold: 18, interval: 1.8, attack: 'magic', target: 'random',
    phases: [0.4], phaseText: ['女王の呼び声に、氷の猟犬が集う！'], enrageBelow: 0.4, opener: 'frozenTomb',
    abilities: [
      { id: 'iceLances', name: 'Ice Lances', cooldown: 4.5, initialDelay: 2, windup: 0, interruptible: false, effect: { kind: 'strike', mult: 0.8, target: 'random' } },
      { id: 'frozenTomb', name: 'Frozen Tomb', cooldown: 13, initialDelay: 5, windup: 1.8, interruptible: true, effect: { kind: 'freeze', duration: 4, count: 1 } },
      { id: 'absoluteZero', name: 'Absolute Zero', cooldown: 24, initialDelay: 8, windup: 3.0, interruptible: false, effect: { kind: 'nova', mult: 8, chill: 3 } },
      { id: 'houndCall', name: 'Hound Call', cooldown: 16, initialDelay: 0.5, windup: 0.5, interruptible: false, minPhase: 1, effect: { kind: 'summon', enemy: 'frost_hound', count: 2, max: 4 } },
    ],
    desc: '中断不可の「Absolute Zero」（紫）に合わせてSanctuaryを張れ。',
  },

  // ───────────────────────── Area 5: The Hollow ─────────────────────────
  { id: 'voidspawn', name: 'Voidspawn', sprite: 'voidspawn', rank: 'normal', size: 'medium', hp: 1.4, dmg: 1.1, gold: 1.2, interval: 1.5, attack: 'melee', target: 'front', desc: '虚無から這い出た獣。' },
  {
    id: 'gloom_caster', name: 'Gloom Caster', sprite: 'gloom_caster', rank: 'normal', size: 'medium', hp: 0.9, dmg: 0.8, gold: 1.4, interval: 2.2, attack: 'magic', target: 'random',
    abilities: [{ id: 'doom', name: 'Doom', cooldown: 10, initialDelay: 3, windup: 1.4, interruptible: true, effect: { kind: 'doom', mult: 4, count: 1, delay: 5 } }],
    desc: '「Doom」の刻印は5秒後に炸裂。Sanctuaryで解除、Barrierで軽減できる。',
  },
  { id: 'hollow_knight', name: 'Hollow Knight', sprite: 'hollow_knight', rank: 'normal', size: 'medium', hp: 2.1, dmg: 1.3, gold: 1.8, interval: 2.0, attack: 'melee', target: 'front', armor: 0.4, ward: 0.3, desc: '装甲とシールドを持つ虚ろな騎士。' },
  { id: 'lantern_eater', name: 'Lantern Eater', sprite: 'lantern_eater', rank: 'normal', size: 'small', hp: 0.9, dmg: 0.7, gold: 1.2, interval: 1.4, attack: 'melee', target: 'random', flying: true, lanternDrainOnHit: 2.5, desc: '攻撃のたびにランタンの火を喰らう。最優先で倒せ。' },
  {
    id: 'abyssal_herald', name: 'Abyssal Herald', sprite: 'abyssal_herald', rank: 'elite', size: 'large', hp: 7, dmg: 1.35, gold: 5, interval: 1.9, attack: 'melee', target: 'front',
    abilities: [
      { id: 'abyssalRend', name: 'Abyssal Rend', cooldown: 10, initialDelay: 3, windup: 2.2, interruptible: true, effect: { kind: 'strike', mult: 9, target: 'front' } },
      { id: 'callDeep', name: 'Call of the Deep', cooldown: 14, initialDelay: 5, windup: 0.6, interruptible: false, effect: { kind: 'summon', enemy: 'voidspawn', count: 2, max: 4 } },
      { id: 'shadowPulse', name: 'Shadow Pulse', cooldown: 24, initialDelay: 8, windup: 2.5, interruptible: false, effect: { kind: 'nova', mult: 3.5 } },
    ],
    desc: 'エリート。中断可能な強打と中断不可の全体攻撃を併用する。',
  },
  {
    id: 'hollow_sovereign', name: 'The Hollow Sovereign', sprite: 'hollow_sovereign', rank: 'boss', size: 'huge', hp: 36, dmg: 1.35, gold: 25, interval: 1.8, attack: 'melee', target: 'front',
    phases: [0.7, 0.35],
    phaseText: ['虚空の殻と日蝕――殻を砕けば日蝕は中断できる！', '「光を……喰らわせろ」――ランタンが喰われていく！'],
    frenzyPhase: 2, opener: 'spawnVoid',
    abilities: [
      { id: 'umbralCleave', name: 'Umbral Cleave', cooldown: 10, initialDelay: 5, windup: 2.4, interruptible: true, maxPhase: 1, effect: { kind: 'strike', mult: 13, target: 'front', perAlly: { enemy: 'voidspawn', mult: 0.15 } } },
      { id: 'spawnVoid', name: 'Spawn Void', cooldown: 14, initialDelay: 8, windup: 0.6, interruptible: false, maxPhase: 0, effect: { kind: 'summon', enemy: 'voidspawn', count: 2, max: 4 } },
      { id: 'eclipse', name: 'Eclipse', cooldown: 24, initialDelay: 2, windup: 6, interruptible: false, wardLinked: true, startWard: 0.15, minPhase: 1, maxPhase: 1, effect: { kind: 'nova', mult: 5.5 } },
      { id: 'markOfDoom', name: 'Mark of Doom', cooldown: 24, initialDelay: 2, windup: 1.4, interruptible: true, minPhase: 2, effect: { kind: 'doom', mult: 7, count: 2, delay: 4 } },
      { id: 'devour', name: 'Devour the Light', cooldown: 16, initialDelay: 7, windup: 5, interruptible: false, channelDrain: 2, breakFrac: 0.06, minPhase: 2, effect: { kind: 'drainLantern', seconds: 3, mult: 2.2 } },
    ],
    desc: '最終ボス。3段階で攻撃が変化する。',
  },

  // ───────────────────────── Area 6: The Ember Heart (cycle 2+) ─────────────────────────
  // The Heart sits deepest on the curve (stageOffset 26) and its echoes are heavy (~5-6x the HP, ~3x the
  // damage of a normal enemy) but drop little gold: that deep, gold outruns level cost and a normal gold
  // multiplier would let levels explode and erase the final challenge. Stage 1 must stay beatable by any
  // party that just felled the Hollow Sovereign (no zero-gold wipe loops).
  { id: 'ashen_echo', name: 'Ashen Echo', sprite: 'ashen_echo', rank: 'normal', size: 'medium', hp: 9, dmg: 4, gold: 1.1, interval: 1.6, attack: 'melee', target: 'front', desc: '過去の冒険者の残響。' },
  {
    id: 'flame_construct', name: 'Flame Construct', sprite: 'flame_construct', rank: 'normal', size: 'large', hp: 16, dmg: 4.3, gold: 1.65, interval: 2.2, attack: 'melee', target: 'front', armor: 0.5,
    abilities: [{ id: 'furnaceSlam', name: 'Furnace Slam', cooldown: 10, initialDelay: 3, windup: 2.0, interruptible: true, effect: { kind: 'strike', mult: 4, target: 'front' } }],
    desc: '溶鉱炉の巨兵。',
  },
  { id: 'cinder_phoenix', name: 'Cinder Phoenix', sprite: 'cinder_phoenix', rank: 'normal', size: 'medium', hp: 6.6, dmg: 3.3, gold: 1.25, interval: 1.7, attack: 'magic', target: 'random', flying: true, phoenix: true, desc: '一度だけ灰から蘇る。' },
  {
    id: 'ember_acolyte', name: 'Ember Acolyte', sprite: 'ember_acolyte', rank: 'normal', size: 'medium', hp: 6, dmg: 2.6, gold: 1.25, interval: 2.0, attack: 'magic', target: 'random',
    abilities: [{ id: 'kindle', name: 'Kindle', cooldown: 10, initialDelay: 3, windup: 1.4, interruptible: true, effect: { kind: 'buffAllies', speed: 1.4, dmg: 1.3, duration: 6 } }],
    desc: '仲間を強化する。中断するか先に倒そう。',
  },
  {
    id: 'ember_tyrant', name: 'Ember Tyrant', sprite: 'ember_tyrant', rank: 'elite', size: 'large', hp: 48, dmg: 6.3, gold: 5, interval: 1.8, attack: 'melee', target: 'front', ward: 0.4,
    abilities: [
      { id: 'searingBrand', name: 'Searing Brand', cooldown: 10, initialDelay: 3, windup: 1.6, interruptible: true, effect: { kind: 'doom', mult: 5, count: 1, delay: 4 } },
      { id: 'flameWave', name: 'Flame Wave', cooldown: 24, initialDelay: 7, windup: 2.5, interruptible: false, effect: { kind: 'nova', mult: 2.5 } },
    ],
    desc: 'エリート。',
  },
  {
    id: 'shadow_guardian', name: 'Shadow Guardian', sprite: 'shadow_guardian', rank: 'boss', size: 'large', hp: 220, dmg: 5.1, gold: 2.4, interval: 1.6, attack: 'melee', target: 'front', armor: 0.3, protector: 0.5, embers: 10, rally: 0.15,
    abilities: [{ id: 'shadowBash', name: 'Shadow Bash', cooldown: 10, initialDelay: 4, windup: 1.8, interruptible: true, effect: { kind: 'strike', mult: 3, target: 'front', stun: 1.5 } }],
    desc: '生存中（スタン中を除く）、他の影の被ダメージ-50%。',
  },
  {
    id: 'shadow_ranger', name: 'Shadow Ranger', sprite: 'shadow_ranger', rank: 'boss', size: 'large', hp: 140, dmg: 3.1, gold: 2.4, interval: 0.8, attack: 'ranged', target: 'lowest', embers: 10, rally: 0.15,
    abilities: [{ id: 'deathmark', name: 'Deathmark Shot', cooldown: 11, initialDelay: 5, windup: 2.4, interruptible: true, effect: { kind: 'strike', mult: 5.5, target: 'lowest' } }],
    desc: '最もHPの低い味方を狙撃する。',
  },
  {
    id: 'shadow_arcanist', name: 'Shadow Arcanist', sprite: 'shadow_arcanist', rank: 'boss', size: 'large', hp: 140, dmg: 4.4, gold: 2.4, interval: 2.0, attack: 'magic', target: 'random', embers: 10, rally: 0.15,
    abilities: [{ id: 'darkMeteor', name: 'Dark Meteor', cooldown: 14, initialDelay: 7, windup: 3.0, interruptible: true, effect: { kind: 'nova', mult: 2.2 } }],
    desc: '「Dark Meteor」は中断可能。',
  },
  {
    id: 'shadow_oracle', name: 'Shadow Oracle', sprite: 'shadow_oracle', rank: 'boss', size: 'large', hp: 130, dmg: 2.4, gold: 2.4, interval: 2.0, attack: 'magic', target: 'random', embers: 10, rally: 0.15,
    abilities: [
      { id: 'darkMending', name: 'Dark Mending', cooldown: 7, initialDelay: 3, windup: 1.8, interruptible: true, effect: { kind: 'healAllies', amount: 0.15 } },
      { id: 'umbralSanctuary', name: 'Umbral Sanctuary', cooldown: 16, initialDelay: 9, windup: 2.0, interruptible: false, effect: { kind: 'wardAllies', amount: 0.25 } },
    ],
    desc: '影を癒し、守る。最初に倒すべきか？',
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
export const ENEMY_LIST = list;
