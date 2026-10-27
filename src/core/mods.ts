import { BAL } from './balance.ts';
import { HERO_ORDER, type HeroId, type Mods, type SaveData } from './types.ts';
import { TREE, TREE_BY_ID } from '../data/tree.ts';
import { RELICS } from '../data/relics.ts';

const per = (v: number): Record<HeroId, number> => ({ guardian: v, ranger: v, arcanist: v, oracle: v });

export function defaultMods(): Mods {
  return {
    lanternBonus: 0,
    goldMult: 1,
    emberMultElite: 1,
    emberMult: 1,
    scavengerChance: 0,
    walkNoLantern: false,
    restHeal: BAL.restHeal,
    lastLight: false,
    autoCast: false,
    smartCast: false,
    levelCostMult: 1,
    shardBonus: 0,
    memoryMult: 1,

    atkMult: per(1),
    hpMult: per(1),
    partyHpMult: 1,
    partyDmgMult: 1,
    atkSpeedMult: 1,
    critChanceAdd: per(0),
    critMultAdd: per(0),
    critChanceGlobalMult: 1,
    nonCritMult: 1,
    cooldownMult: 1,

    blockChance: BAL.blockChance,
    blockReduction: BAL.blockReduction,
    retaliation: 0,
    shockwaveBash: false,
    sunder: 0,
    ironResolve: false,
    unbrokenVow: false,
    cleave: 0,
    bashCdFlat: 0,
    bashStunBonus: 0,
    bashWeakens: false,

    twinShot: false,
    autoMarkEvery: 0,
    markBonus: BAL.markBonus,
    arrowRainExtra: 0,
    arrowRainCdFlat: 0,
    arrowRainMarks: false,
    executioner: 0,
    deadeye: false,
    pierce: 0,
    rangerDoubleShot: false,
    markPermanent: false,

    burnMaxStacks: BAL.burnMaxStacks,
    burnDmgMult: 1,
    burnTickMult: 1,
    chainEvery: 0,
    chainTargets: 3,
    chainDmg: 0.6,
    chainBurn: false,
    splash: 0,
    meteorExtra: 0,
    meteorCdFlat: 0,
    meteorBurningGround: false,
    combustion: false,
    inferno: false,
    burnAll: false,

    healMult: 1,
    overflowCap: 0,
    benediction: false,
    hallowed: false,
    intercession: false,
    divineEcho: false,
    glint: false,
    barrierMult: 1,
    sanctuaryLasting: false,

    coveringFire: false,
    pinningVolley: false,
    moltenBash: false,
    spellstrike: 0,
    kindledArrows: false,
    aegisRetort: false,
    pyreOfRenewal: false,
    blessedAim: false,
    radiantMeteor: false,
    bulwarkOfFaith: false,
    emberbond: false,

    overdrive: false,
    overdriveFill: 1,
    overdriveDuration: 0,
    relicSlots: 0,
    bastion: false,
    phoenixAll: false,
    reflect: 0,
    waveBarrier: 0,
  };
}

/** Compute all modifiers from the save (tree ranks, prestige, equipped relics). */
export function computeMods(save: SaveData): Mods {
  const m = defaultMods();
  if (save.prestige >= 1) {
    m.overdrive = true;
    m.relicSlots = 2 + (save.prestige >= 2 ? 1 : 0);
    const peak = HERO_ORDER.reduce((a, h) => a + (save.peakLevels?.[h] ?? 0), 0);
    m.memoryMult = 1 + BAL.memoryPerLevel * peak;
  }
  for (const node of TREE) {
    const rank = save.tree[node.id] ?? 0;
    if (rank > 0) node.apply(m, rank);
  }
  const slots = m.relicSlots;
  for (const id of save.relicsEquipped.slice(0, slots)) {
    const r = RELICS[id];
    if (r) r.apply(m);
  }
  return m;
}

export function isNodeOwned(save: SaveData, id: string): boolean {
  return (save.tree[id] ?? 0) > 0;
}

export { TREE_BY_ID };
