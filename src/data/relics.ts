import type { RelicDef } from '../core/types.ts';

// Relics are build-defining. Unlocked by Rekindle; bought with Relic Shards; equipped at camp.
// Each one changes how a hero or a mechanic plays and gives something up for it: none is a free "+X% damage".

const list: RelicDef[] = [
  {
    id: 'gale_quiver', name: 'Gale Quiver', build: '攻撃速度', cost: 6, icon: 'relic_quiver',
    desc: '全員の攻撃速度 +80%、1撃のダメージ -10%。命中時効果（Burn・Mark・連鎖）が加速する。',
    apply: (m) => { m.atkSpeedMult *= 1.8; m.partyDmgMult *= 0.9; },
  },
  {
    id: 'stormhawk_eye', name: 'Stormhawk Eye', build: 'クリティカル', cost: 7, icon: 'relic_eye',
    desc: '全員のクリティカル率 +5%、さらに ×1.5。クリティカルダメージ +40%。非クリティカルのダメージ -30%。',
    apply: (m) => {
      m.critChanceGlobalMult *= 1.5;
      for (const k of ['guardian', 'ranger', 'arcanist', 'oracle'] as const) { m.critChanceAdd[k] += 0.05; m.critMultAdd[k] += 0.4; }
      m.nonCritMult *= 0.7;
    },
  },
  {
    id: 'conduit_prism', name: 'Conduit Prism', build: '魔法連鎖', cost: 7, icon: 'relic_prism',
    desc: 'Ember Boltが毎回Chain Lightningになり、連鎖 +2体・連鎖ダメージ90%。連鎖がBurnを付与。Arcanistの攻撃力 +30%。',
    apply: (m) => { m.chainEvery = 1; m.chainTargets += 2; m.chainDmg = Math.max(m.chainDmg, 0.9); m.chainBurn = true; m.atkMult.arcanist *= 1.3; },
  },
  {
    id: 'bastion_heart', name: 'Bastion Heart', build: 'バリア反撃', cost: 7, icon: 'relic_heart',
    desc: '各ウェーブ開始時に全員へ最大HP30%のBarrier。全てのBarrier量 +25%。Barrierがある味方の与ダメージ +20%。誰かのBarrierが壊れるたび、敵全体に衝撃波（パーティ平均攻撃力300%）。',
    apply: (m) => { m.waveBarrier = Math.max(m.waveBarrier, 0.3); m.barrierMult *= 1.25; m.bastion = true; m.barrierDmgBonus += 0.2; },
  },
  {
    id: 'ember_crown', name: 'Ember Crown', build: '燃焼', cost: 7, icon: 'relic_crown',
    desc: '全員の攻撃がBurnを付与。Burnの最大スタック +3、Burnダメージ ×1.5。',
    apply: (m) => { m.burnAll = true; m.burnMaxStacks += 3; m.burnDmgMult *= 1.5; },
  },
  {
    id: 'phoenix_plume', name: 'Phoenix Plume', build: '不死鳥', cost: 6, icon: 'relic_plume',
    desc: '各キャラクターがRun中に1度だけ、倒れても2秒後にHP50%で蘇る。HPが減っているほど与ダメージが上がる（HP半分で+40%）。仲間が倒れるたび、その遠征の間ずっと味方全員の与ダメージ +25%（重複する）。',
    apply: (m) => { m.phoenixAll = true; m.woundDmgBonus += 0.8; m.fallDmgBonus += 0.25; },
  },
  {
    id: 'hourglass_ash', name: 'Hourglass of Ash', build: 'スキル連打', cost: 6, icon: 'relic_hourglass',
    desc: '全アクティブスキルのCooldown -30%。Overdriveゲージ上昇 +25%。通常攻撃のダメージ -15%。',
    apply: (m) => { m.cooldownMult *= 0.7; m.overdriveFill *= 1.25; m.autoDmgMult *= 0.85; },
  },
  {
    id: 'lantern_eternity', name: 'Lantern of Eternity', build: '持久', cost: 5, icon: 'relic_lantern',
    desc: 'ランタン +20秒。ウェーブ間の回復量 ×2。ランタンの残りが多いほど味方全員の与ダメージが上がる（満タンで+35%）。',
    apply: (m) => { m.lanternBonus += 20; m.restHeal *= 2; m.lanternDmgBonus += 0.35; },
  },
  {
    id: 'gilded_idol', name: 'Gilded Idol', build: '財宝', cost: 5, icon: 'relic_idol',
    desc: '獲得Gold ×1.2、獲得Ember +20%、ボス初撃破時のRelic Shard +1。',
    apply: (m) => { m.goldMult *= 1.2; m.emberMult *= 1.2; m.shardBonus += 1; },
  },
  {
    id: 'twin_fang', name: 'Twin Fang', build: '連射', cost: 6, icon: 'relic_fang',
    desc: 'Rangerが毎回2本の矢を放つ。Markが時間切れで消えなくなる。Arrow RainのCooldown +4秒。',
    apply: (m) => { m.rangerDoubleShot = true; m.markPermanent = true; m.arrowRainCdFlat -= 4; },
  },
  {
    id: 'mirror_aegis', name: 'Mirror Aegis', build: '反射', cost: 6, icon: 'relic_mirror',
    desc: '中断できなかったオレンジの技が命中すると、その威力の1200%を敵全体へ返す。Shield BashのCooldown +2秒。',
    apply: (m) => { m.mirrorStrike = Math.max(m.mirrorStrike, 12); m.bashCdFlat -= 2; },
  },
  {
    id: 'soulbound_chalice', name: 'Soulbound Chalice', build: '聖杯', cost: 6, icon: 'relic_chalice',
    desc: '回復の余剰分はBarrierに変換（最大HP80%まで）。Barrierがある味方の与ダメージ +30%。回復量 ×1.5。',
    apply: (m) => { m.overflowCap = Math.max(m.overflowCap, 0.8); m.barrierDmgBonus += 0.3; m.healMult *= 1.5; },
  },
];

export const RELICS: Record<string, RelicDef> = Object.fromEntries(list.map((r) => [r.id, r]));
export const RELIC_LIST = list;
