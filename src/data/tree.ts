import type { TreeNodeDef } from '../core/types.ts';

// Layout: 1200 x 800 virtual space, hub at (600, 400).
// Guardian top-left, Ranger top-right, Arcanist bottom-right, Oracle bottom-left.
// Expedition chain runs horizontally through the hub. Synergies sit between branches.
// Rekindled nodes (prestige) live on the outer rim and have no edge to the hub.

export const TREE: TreeNodeDef[] = [
  // ─────────────── Root ───────────────
  {
    id: 'core', name: 'Lantern Core', branch: 'core', kind: 'root', maxRank: 1, costs: [0],
    desc: 'ランタンの芯。ここから枝を伸ばそう。', x: 600, y: 400, req: {}, apply: () => {},
  },

  // ─────────────── Expedition ───────────────
  {
    id: 'kindling', name: 'Kindling', branch: 'expedition', kind: 'stat', maxRank: 3, costs: [2, 4, 7],
    desc: 'ランタンの燃焼時間 +8秒（ランクごと）', x: 510, y: 400, req: { anyOf: ['core'] },
    apply: (m, r) => { m.lanternBonus += 8 * r; },
  },
  {
    id: 'swift_march', name: 'Swift March', branch: 'expedition', kind: 'behavior', maxRank: 1, costs: [6],
    desc: 'ウェーブ間の移動中はランタンが燃えない。移動中の回復量が2倍（8%→16%）。', x: 430, y: 400, req: { anyOf: ['kindling'] },
    apply: (m) => { m.walkNoLantern = true; m.restHeal *= 2; },
  },
  {
    id: 'last_light', name: 'Last Light', branch: 'expedition', kind: 'ability', maxRank: 1, costs: [12],
    desc: '1回のRunにつき1度、ランタンが尽きても8秒間だけ戦い続けられる。その間、与ダメージ+40%・ランタン吸収無効。', x: 350, y: 400, req: { anyOf: ['swift_march'] },
    apply: (m) => { m.lastLight = true; },
  },
  {
    id: 'gilded_path', name: 'Gilded Path', branch: 'expedition', kind: 'stat', maxRank: 3, costs: [2, 4, 8],
    desc: '獲得Gold +20%（ランクごと）', x: 690, y: 400, req: { anyOf: ['core'] },
    apply: (m, r) => { m.goldMult *= 1 + 0.2 * r; },
  },
  {
    id: 'ember_sense', name: 'Ember Sense', branch: 'expedition', kind: 'stat', maxRank: 2, costs: [8, 12],
    desc: 'エリート・ボスから得るEmber +25%（ランクごと・最低+1）', x: 770, y: 400, req: { anyOf: ['gilded_path'] },
    apply: (m, r) => { m.emberMultElite += 0.25 * r; },
  },
  {
    id: 'scavenger', name: 'Scavenger', branch: 'expedition', kind: 'behavior', maxRank: 1, costs: [8],
    desc: '通常の敵が5%の確率でEmberを落とす（1回のRunで最大3個）。', x: 850, y: 400, req: { anyOf: ['ember_sense'] },
    apply: (m) => { m.scavengerChance += 0.05; },
  },
  {
    id: 'battle_instinct', name: 'Battle Instinct', branch: 'expedition', kind: 'ability', maxRank: 1, costs: [25],
    desc: 'アクティブスキルのAUTO（自動発動）が使えるようになる。準備でき次第発動する（PERFECTにはならない）。', x: 930, y: 400, req: { anyOf: ['scavenger'] },
    apply: (m) => { m.autoCast = true; },
  },

  // ─────────────── Guardian ───────────────
  {
    id: 'tempered_steel', name: 'Tempered Steel', branch: 'guardian', kind: 'stat', maxRank: 3, costs: [1, 2, 4],
    desc: 'Guardianの攻撃力・最大HP +25%（ランクごと）。ランク3：通常攻撃が隣の敵にも40%の薙ぎ払い。', x: 470, y: 320, req: { anyOf: ['core'], hero: ['guardian'] },
    apply: (m, r) => { m.atkMult.guardian *= 1 + 0.25 * r; m.hpMult.guardian *= 1 + 0.25 * r; if (r >= 3) m.cleave = Math.max(m.cleave, 0.4); },
  },
  {
    id: 'retaliation', name: 'Retaliation', branch: 'guardian', kind: 'ability', maxRank: 1, costs: [3],
    desc: 'Blockするたびに攻撃してきた敵へ反撃（攻撃力120%）。', x: 380, y: 300, req: { anyOf: ['tempered_steel'] },
    apply: (m) => { m.retaliation = 1.2; },
  },
  {
    id: 'shield_wall', name: 'Shield Wall', branch: 'guardian', kind: 'stat', maxRank: 3, costs: [2, 3, 5],
    desc: 'Block率 +8%（ランクごと）。Blockは被ダメージを60%軽減する。', x: 290, y: 280, req: { anyOf: ['retaliation'] },
    apply: (m, r) => { m.blockChance += 0.08 * r; },
  },
  {
    id: 'shockwave_bash', name: 'Shockwave Bash', branch: 'guardian', kind: 'behavior', maxRank: 1, costs: [6],
    desc: 'Shield Bashが敵全体に命中（他の敵には50%・0.75秒スタン）し、全員の溜め攻撃を中断できる。', x: 460, y: 230, req: { anyOf: ['tempered_steel'] },
    apply: (m) => { m.shockwaveBash = true; },
  },
  {
    id: 'iron_resolve', name: 'Iron Resolve', branch: 'guardian', kind: 'behavior', maxRank: 1, costs: [5],
    desc: '溜め攻撃を中断すると、Shield BashのCooldownが半分になりGuardianがHP10%回復。', x: 370, y: 200, req: { anyOf: ['shield_wall', 'shockwave_bash'] },
    apply: (m) => { m.ironResolve = true; },
  },
  {
    id: 'sunder', name: 'Sunder', branch: 'guardian', kind: 'ability', maxRank: 1, costs: [10],
    desc: 'Shield Bashを受けた敵は6秒間、装甲が0になる。', x: 455, y: 135, req: { anyOf: ['shockwave_bash'] },
    apply: (m) => { m.sunder = 6; },
  },
  {
    id: 'unbroken_vow', name: 'Unbroken Vow', branch: 'guardian', kind: 'keystone', maxRank: 1, costs: [28],
    desc: '【要】GuardianがBlock・Barrierで防いだダメージを「誓い」として蓄積。最大HP40%分たまると、次のShield Bashが「Vowbreaker」に：蓄積量＋攻撃力300%の確定ダメージを敵全体に与え、2秒スタン。', x: 255, y: 165,
    req: { anyOf: ['shield_wall', 'iron_resolve'] },
    apply: (m) => { m.unbrokenVow = true; },
  },

  // ─────────────── Ranger ───────────────
  {
    id: 'fletching', name: 'Fletching', branch: 'ranger', kind: 'stat', maxRank: 3, costs: [2, 4, 7],
    desc: 'Rangerの攻撃力 +25%（ランクごと）。ランク3：矢が後ろの敵を貫通（50%）。', x: 730, y: 320, req: { anyOf: ['core'], hero: ['ranger'] },
    apply: (m, r) => { m.atkMult.ranger *= 1 + 0.25 * r; if (r >= 3) m.pierce = Math.max(m.pierce, 0.5); },
  },
  {
    id: 'keen_eye', name: 'Keen Eye', branch: 'ranger', kind: 'stat', maxRank: 3, costs: [3, 5, 8],
    desc: 'Rangerのクリティカル率 +6%・クリティカルダメージ +25%（ランクごと）', x: 820, y: 300, req: { anyOf: ['fletching'] },
    apply: (m, r) => { m.critChanceAdd.ranger += 0.06 * r; m.critMultAdd.ranger += 0.25 * r; },
  },
  {
    id: 'arrow_storm', name: 'Arrow Storm', branch: 'ranger', kind: 'behavior', maxRank: 1, costs: [8],
    desc: 'Arrow Rainの矢 +6本、Cooldown -3秒。', x: 740, y: 230, req: { anyOf: ['fletching'] },
    apply: (m) => { m.arrowRainExtra += 6; m.arrowRainCdFlat += 3; },
  },
  {
    id: 'twin_shot', name: 'Twin Shot', branch: 'ranger', kind: 'ability', maxRank: 1, costs: [6],
    desc: 'クリティカル時、別の敵に追加の矢を放つ。', x: 910, y: 280, req: { anyOf: ['keen_eye'] },
    apply: (m) => { m.twinShot = true; },
  },
  {
    id: 'hunters_instinct', name: "Hunter's Instinct", branch: 'ranger', kind: 'behavior', maxRank: 1, costs: [5],
    desc: '5射ごとに自動でMarkを付与（4秒）。Markの効果 +10%（20%→30%）。', x: 830, y: 210, req: { anyOf: ['keen_eye', 'arrow_storm'] },
    apply: (m) => { m.autoMarkEvery = 5; m.markBonus += 0.1; },
  },
  {
    id: 'executioner', name: 'Executioner', branch: 'ranger', kind: 'ability', maxRank: 1, costs: [7],
    desc: 'HP35%未満の敵に対し、Rangerのダメージ +80%。', x: 750, y: 140, req: { anyOf: ['arrow_storm'] },
    apply: (m) => { m.executioner = 0.8; },
  },
  {
    id: 'deadeye', name: 'Deadeye', branch: 'ranger', kind: 'keystone', maxRank: 1, costs: [28],
    desc: '【要】4回目のクリティカルごとに「Deadeye」が発動し、ダメージ4倍。', x: 945, y: 165, req: { anyOf: ['twin_shot', 'hunters_instinct'] },
    apply: (m) => { m.deadeye = true; },
  },

  // ─────────────── Arcanist ───────────────
  {
    id: 'kindled_focus', name: 'Kindled Focus', branch: 'arcanist', kind: 'stat', maxRank: 3, costs: [3, 6, 10],
    desc: 'Arcanistの攻撃力 +25%・最大HP +10%（ランクごと）。ランク3：Ember Boltが周囲の敵に30%の飛び火。', x: 730, y: 480, req: { anyOf: ['core'], hero: ['arcanist'] },
    apply: (m, r) => { m.atkMult.arcanist *= 1 + 0.25 * r; m.hpMult.arcanist *= 1 + 0.1 * r; if (r >= 3) m.splash = Math.max(m.splash, 0.3); },
  },
  {
    id: 'wildfire', name: 'Wildfire', branch: 'arcanist', kind: 'stat', maxRank: 2, costs: [5, 9],
    desc: 'Burnの最大スタック +2、Burnダメージ +25%（ランクごと）', x: 820, y: 500, req: { anyOf: ['kindled_focus'] },
    apply: (m, r) => { m.burnMaxStacks += 2 * r; m.burnDmgMult *= 1 + 0.25 * r; },
  },
  {
    id: 'meteor_swarm', name: 'Meteor Swarm', branch: 'arcanist', kind: 'behavior', maxRank: 1, costs: [9],
    desc: 'Meteorに小隕石3発が追加（各100%）、Cooldown -3秒。', x: 740, y: 570, req: { anyOf: ['kindled_focus'] },
    apply: (m) => { m.meteorExtra += 3; m.meteorCdFlat += 3; },
  },
  {
    id: 'combustion', name: 'Combustion', branch: 'arcanist', kind: 'ability', maxRank: 1, costs: [10],
    desc: 'Burn中の敵が倒れると爆発し、敵全体に攻撃力80%の魔法ダメージ＋Burn1。', x: 910, y: 520, req: { anyOf: ['wildfire'] },
    apply: (m) => { m.combustion = true; },
  },
  {
    id: 'chain_lightning', name: 'Chain Lightning', branch: 'arcanist', kind: 'ability', maxRank: 1, costs: [8],
    desc: '3回に1回、Ember BoltがChain Lightningに変化し、さらに3体へ連鎖（各60%）。', x: 830, y: 590, req: { anyOf: ['wildfire', 'meteor_swarm'] },
    apply: (m) => { if (m.chainEvery === 0) m.chainEvery = 3; },
  },
  {
    id: 'arcane_conduit', name: 'Arcane Conduit', branch: 'arcanist', kind: 'behavior', maxRank: 1, costs: [10],
    desc: 'Chain Lightningの連鎖 +2体、連鎖ダメージ80%に上昇し、Burnを付与する。', x: 750, y: 665, req: { anyOf: ['chain_lightning'] },
    apply: (m) => { m.chainTargets += 2; m.chainDmg = Math.max(m.chainDmg, 0.8); m.chainBurn = true; },
  },
  {
    id: 'inferno', name: 'Inferno', branch: 'arcanist', kind: 'keystone', maxRank: 1, costs: [28],
    desc: '【要】Burnがクリティカルするようになり、燃焼の速度が2倍になる。', x: 945, y: 635, req: { anyOf: ['combustion', 'arcane_conduit'] },
    apply: (m) => { m.inferno = true; m.burnTickMult *= 2; },
  },

  // ─────────────── Oracle ───────────────
  {
    id: 'grace', name: 'Grace', branch: 'oracle', kind: 'stat', maxRank: 3, costs: [4, 8, 13],
    desc: 'Oracleの回復量・攻撃力 +25%、味方全員の最大HP +8%（ランクごと）。ランク3：回復を受けた味方は4秒間与ダメージ+10%。', x: 470, y: 480, req: { anyOf: ['core'], hero: ['oracle'] },
    apply: (m, r) => { m.healMult *= 1 + 0.25 * r; m.atkMult.oracle *= 1 + 0.25 * r; m.partyHpMult *= 1 + 0.08 * r; if (r >= 3) m.glint = true; },
  },
  {
    id: 'overflow', name: 'Overflow', branch: 'oracle', kind: 'behavior', maxRank: 1, costs: [8],
    desc: '回復の余剰分がBarrierに変換される（最大HP30%まで）。', x: 380, y: 500, req: { anyOf: ['grace'] },
    apply: (m) => { m.overflowCap = Math.max(m.overflowCap, 0.3); },
  },
  {
    id: 'hallowed_ground', name: 'Hallowed Ground', branch: 'oracle', kind: 'behavior', maxRank: 1, costs: [10],
    desc: 'Sanctuaryの回復が25%になり、6秒間味方の与ダメージ +30%。', x: 460, y: 570, req: { anyOf: ['grace'] },
    apply: (m) => { m.hallowed = true; },
  },
  {
    id: 'benediction', name: 'Benediction', branch: 'oracle', kind: 'ability', maxRank: 1, costs: [10],
    desc: '8秒ごとにOracleが祝福：味方全員の攻撃速度 +30%（4秒）。', x: 290, y: 520, req: { anyOf: ['overflow'] },
    apply: (m) => { m.benediction = true; },
  },
  {
    id: 'intercession', name: 'Intercession', branch: 'oracle', kind: 'ability', maxRank: 1, costs: [10],
    desc: '味方のHPが20%を下回ると、即座に最大HP25%のBarrierで守る（各味方20秒に1回）。', x: 370, y: 595, req: { anyOf: ['overflow', 'hallowed_ground'] },
    apply: (m) => { m.intercession = true; },
  },
  {
    id: 'divine_echo', name: 'Divine Echo', branch: 'oracle', kind: 'keystone', maxRank: 1, costs: [28],
    desc: '【要】Sanctuaryの4秒後に50%の効果で再発動。全てのBarrier量 +30%。', x: 275, y: 645, req: { anyOf: ['benediction', 'intercession'] },
    apply: (m) => { m.divineEcho = true; m.barrierMult *= 1.3; },
  },

  // ─────────────── Cross-class synergies ───────────────
  {
    id: 'covering_fire', name: 'Covering Fire', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [12], pair: ['guardian', 'ranger'], build: 'BULWARK',
    desc: 'GuardianがBlockすると、Rangerが攻撃者へ即座に矢を放ちMarkする。', x: 560, y: 150,
    req: { allOf: ['shield_wall', 'hunters_instinct'] },
    apply: (m) => { m.coveringFire = true; },
  },
  {
    id: 'pinning_volley', name: 'Pinning Volley', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [14], pair: ['guardian', 'ranger'], build: 'HUNT',
    desc: 'スタン中の敵へのArrow Rainは必ずクリティカル。Shield Bashのスタン +0.5秒。', x: 640, y: 150,
    req: { allOf: ['shockwave_bash', 'keen_eye'] },
    apply: (m) => { m.pinningVolley = true; m.bashStunBonus += 0.5; },
  },
  {
    id: 'molten_bash', name: 'Molten Bash', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [14], pair: ['guardian', 'arcanist'], build: 'PYRE',
    desc: 'Shield BashがBurn3を付与。スタン中の敵は魔法ダメージ +40%。', x: 600, y: 320,
    req: { allOf: ['iron_resolve', 'kindled_focus'] },
    apply: (m) => { m.moltenBash = true; },
  },
  {
    id: 'spellstrike', name: 'Spellstrike', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [16], pair: ['ranger', 'arcanist'], build: 'STORM',
    desc: 'Mark中の敵への魔法ダメージ +40%。Chain LightningはMark中の敵を優先して連鎖する。', x: 1110, y: 350,
    req: { allOf: ['hunters_instinct', 'chain_lightning'] },
    apply: (m) => { m.spellstrike = 0.4; },
  },
  {
    id: 'kindled_arrows', name: 'Kindled Arrows', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [14], pair: ['ranger', 'arcanist'], build: 'PYRE',
    desc: 'Rangerのクリティカルが敵にBurn1を付与する。', x: 1110, y: 450,
    req: { allOf: ['keen_eye', 'wildfire'] },
    apply: (m) => { m.kindledArrows = true; },
  },
  {
    id: 'aegis_retort', name: 'Aegis Retort', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [16], pair: ['guardian', 'oracle'], build: 'BULWARK',
    desc: 'GuardianのBarrierが破壊されると、衝撃波で敵全体に攻撃力300%の反撃。', x: 90, y: 350,
    req: { allOf: ['retaliation', 'overflow'] },
    apply: (m) => { m.aegisRetort = true; },
  },
  {
    id: 'bulwark_of_faith', name: 'Bulwark of Faith', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [14], pair: ['guardian', 'oracle'], build: 'RADIANCE',
    desc: 'SanctuaryがShield BashのCooldownをリセットし、4秒間全ての敵をGuardianへ引きつける。GuardianのBarrier +50%。', x: 90, y: 450,
    req: { allOf: ['iron_resolve', 'hallowed_ground'] },
    apply: (m) => { m.bulwarkOfFaith = true; },
  },
  {
    id: 'pyre_of_renewal', name: 'Pyre of Renewal', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [16], pair: ['arcanist', 'oracle'], build: 'PYRE',
    desc: 'Burn中の敵を倒すと、味方全員がHP2%回復し、全スキルのCooldownが0.5秒短縮。', x: 560, y: 650,
    req: { allOf: ['combustion', 'grace'] },
    apply: (m) => { m.pyreOfRenewal = true; },
  },
  {
    id: 'radiant_meteor', name: 'Radiant Meteor', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [16], pair: ['arcanist', 'oracle'], build: 'RADIANCE',
    desc: 'Meteorが命中した敵1体につき、味方全員に最大HP10%のBarrier（最大40%）。', x: 640, y: 650,
    req: { allOf: ['meteor_swarm', 'overflow'] },
    apply: (m) => { m.radiantMeteor = true; },
  },
  {
    id: 'blessed_aim', name: 'Blessed Aim', branch: 'synergy', kind: 'synergy', maxRank: 1, costs: [16], pair: ['ranger', 'oracle'], build: 'HUNT',
    desc: 'Benediction中はクリティカル率 +15%。クリティカル時、最もHPの低い味方をダメージの4%回復。', x: 600, y: 480,
    req: { allOf: ['twin_shot', 'benediction'] },
    apply: (m) => { m.blessedAim = true; },
  },
  {
    id: 'emberbond', name: 'Emberbond', branch: 'synergy', kind: 'keystone', maxRank: 1, costs: [45], pair: ['guardian', 'ranger', 'arcanist', 'oracle'], build: 'EMBERBOND',
    desc: '【絆】PERFECTで発動したスキル（Tactical InstinctのAUTOでも可）が仲間の「絆の灯」をともす（15秒）。4人全員の灯がそろうと「Ember Nova」：敵全体に平均攻撃力800%の確定ダメージ＋シールド破壊、味方の攻撃速度+30%（5秒）。', x: 600, y: 240,
    req: { synergyCount: 3, hero: ['guardian', 'ranger', 'arcanist', 'oracle'] },
    apply: (m) => { m.emberbond = true; },
  },

  // ─────────────── Rekindled (prestige) ───────────────
  {
    id: 'tactical_instinct', name: 'Tactical Instinct', branch: 'rekindled', kind: 'behavior', maxRank: 1, costs: [12],
    desc: 'AUTOが賢くなる：溜め攻撃に合わせてShield Bash、紫の大技の直前にSanctuary、集団やシールドにMeteor。条件を満たしたAUTO発動も「絆の灯」をともす（Cooldown回復は手動のみ）。', x: 1010, y: 400,
    req: { prestige: 1, anyOf: ['battle_instinct'] },
    apply: (m) => { m.smartCast = true; },
  },
  {
    id: 'veteran_wisdom', name: "Veteran's Wisdom", branch: 'rekindled', kind: 'stat', maxRank: 1, costs: [15],
    desc: '獲得Gold ×2、レベルアップ費用 -20%。', x: 600, y: 50, req: { prestige: 1 },
    apply: (m) => { m.goldMult *= 2; m.levelCostMult *= 0.8; },
  },
  {
    id: 'relic_socket', name: 'Relic Socket', branch: 'rekindled', kind: 'stat', maxRank: 1, costs: [20],
    desc: 'Relicの装備枠 +1。', x: 270, y: 400, req: { prestige: 1 },
    apply: (m) => { m.relicSlots += 1; },
  },
  {
    id: 'overdrive_mastery', name: 'Overdrive Mastery', branch: 'rekindled', kind: 'behavior', maxRank: 1, costs: [20],
    desc: 'Overdriveゲージの上昇 +40%、持続 +2秒。', x: 600, y: 760, req: { prestige: 1 },
    apply: (m) => { m.overdriveFill *= 1.4; m.overdriveDuration += 2; },
  },
  {
    id: 'ascendant_guardian', name: 'Ascendant Guardian', branch: 'rekindled', kind: 'keystone', maxRank: 1, costs: [25],
    desc: 'Guardianの攻撃力・HP ×1.5。紫（中断不可）の溜め攻撃にShield Bashを当てると、その威力を60%弱める。', x: 150, y: 90,
    req: { prestige: 1, anyOf: ['unbroken_vow', 'shield_wall', 'sunder'] },
    apply: (m) => { m.atkMult.guardian *= 1.5; m.hpMult.guardian *= 1.5; m.bashWeakens = true; },
  },
  {
    id: 'ascendant_ranger', name: 'Ascendant Ranger', branch: 'rekindled', kind: 'keystone', maxRank: 1, costs: [25],
    desc: 'Rangerの攻撃力 ×1.5。Arrow Rainの矢 +4本、命中した敵をMarkする。', x: 1050, y: 90,
    req: { prestige: 1, anyOf: ['deadeye', 'twin_shot', 'executioner'] },
    apply: (m) => { m.atkMult.ranger *= 1.5; m.arrowRainExtra += 4; m.arrowRainMarks = true; },
  },
  {
    id: 'ascendant_arcanist', name: 'Ascendant Arcanist', branch: 'rekindled', kind: 'keystone', maxRank: 1, costs: [25],
    desc: 'Arcanistの攻撃力 ×1.5。Meteor Cooldown -4秒、着弾地点が4秒間燃え続ける。', x: 1050, y: 710,
    req: { prestige: 1, anyOf: ['inferno', 'combustion', 'arcane_conduit'] },
    apply: (m) => { m.atkMult.arcanist *= 1.5; m.meteorCdFlat += 4; m.meteorBurningGround = true; },
  },
  {
    id: 'ascendant_oracle', name: 'Ascendant Oracle', branch: 'rekindled', kind: 'keystone', maxRank: 1, costs: [25],
    desc: 'Oracleの回復量 ×1.5、味方全員の最大HP +20%。SanctuaryのBarrierが3倍長持ちする。', x: 150, y: 710,
    req: { prestige: 1, anyOf: ['divine_echo', 'benediction', 'intercession'] },
    apply: (m) => { m.healMult *= 1.5; m.partyHpMult *= 1.2; m.sanctuaryLasting = true; },
  },
];

export const TREE_BY_ID: Record<string, TreeNodeDef> = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const SYNERGY_IDS = TREE.filter((n) => n.branch === 'synergy' && n.id !== 'emberbond').map((n) => n.id);
