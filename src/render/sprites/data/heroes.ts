// Hero sprite maps (authored facing RIGHT) + gear-tier palettes (0 worn bronze → 5 radiant white-gold).
// Map chars are materials; each tier palette maps them to colours. Tier-gated chars are null below their tier.
import type { Palette } from '../pix.ts';
import type { UnitArt } from '../units.ts';
import { cc, cropRows, rotateRows, type CharCanvas } from './draw.ts';

type Tri = readonly [string, string, string];
type Duo = readonly [string, string];

/** Armour metal by gear tier: [light, mid, shadow]. */
export const TIER_METAL: readonly Tri[] = [
  ['#c09468', '#8a6040', '#55392a'], // 0 worn bronze / leather
  ['#e6edf4', '#a2aebd', '#5d697c'], // 1 steel
  ['#ffe28a', '#e8a43a', '#9a571e'], // 2 ember-gold
  ['#f2fcff', '#9ed6f6', '#4b7cc0'], // 3 azure-silver
  ['#ff8070', '#cc3444', '#6c1832'], // 4 crimson
  ['#ffffff', '#fff0c4', '#dcae58'], // 5 radiant white-gold
];

/** Trim / filigree by tier: [light, dark]. */
export const TIER_TRIM: readonly Duo[] = [
  ['#9c7a52', '#5e4630'],
  ['#c9d3de', '#76839a'],
  ['#fff2a8', '#d68a22'],
  ['#c4f4ff', '#3d9ee6'],
  ['#ffe07a', '#c88a1c'],
  ['#fffbe2', '#ffcc5a'],
];

/** Cloth accent (cape from tier 4). */
const TIER_CAPE: readonly (Duo | null)[] = [null, null, null, null, ['#d8364a', '#7a1a32'], ['#fff6d8', '#e8b85a']];

/** Glow (runes / gems) from tier 3. */
const TIER_GLOW: readonly (string | null)[] = [null, null, null, '#8ff4ff', '#ffb04a', '#fff6c0'];

export const OUTLINE = '#160e1a';

function base(t: number): Palette {
  const m = TIER_METAL[t];
  const tr = TIER_TRIM[t];
  const cape = TIER_CAPE[t];
  return {
    A: m[0], a: m[1], b: m[2],
    T: tr[0], t: tr[1],
    '2': t >= 2 ? tr[0] : null,
    '@': t >= 2 ? tr[1] : m[1],
    '3': TIER_GLOW[t],
    R: cape ? cape[0] : null,
    r: cape ? cape[1] : null,
    S: '#f2c49a', s: '#c98d66',
    k: '#1c1220',
    L: '#8a5a3a', l: '#583826',
    d: '#3a2a30', D: '#5a4048',
  };
}

const aura = (t: number): string | null => (t >= 5 ? '#fff4b8' : null);

/**
 * Collapsed pose: the weaponless body falls on its back (head towards the rear), centred on the anchor column,
 * and the dropped weapon is drawn on the ground in front (only into empty cells).
 */
function deadMap(rows: readonly string[], ax: number, drop: (c: CharCanvas, feetX: number, groundY: number) => void): string[] {
  const body = cropRows(rotateRows(rows, false));
  const w = body[0].length;
  const x0 = Math.max(0, ax - Math.floor(w / 2) - 2);
  const c = cc(x0 + w + 10, body.length);
  c.stamp(body, x0, 0);
  const keep = c.out();
  drop(c, x0 + w, body.length - 1);
  // never paint over the body
  const out = c.out().map((r, y) => r.split('').map((ch, x) => (keep[y][x] !== '.' ? keep[y][x] : ch)).join(''));
  return out;
}

// ─────────────────────────────── Guardian ───────────────────────────────

const G_PLUME: readonly Tri[] = [
  ['#d0743a', '#9a4c26', '#62301c'],
  ['#ff8f42', '#d8602a', '#8c3a1e'],
  ['#ffb64a', '#ff7a2a', '#b8441c'],
  ['#ffa04e', '#f0682e', '#a8381e'],
  ['#ffd25e', '#ff7a2a', '#c43022'],
  ['#fff7d2', '#ffcc4a', '#ff8a2a'],
];
const G_TABARD: readonly Duo[] = [
  ['#5a6f92', '#39465f'],
  ['#4f86d8', '#2f5498'],
  ['#3f6fd0', '#24408a'],
  ['#6ac2ff', '#2f7ed0'],
  ['#2c3a78', '#1a2250'],
  ['#9ad6ff', '#4f96d8'],
];
const G_SHIELD: readonly Tri[] = [
  ['#a0603a', '#7a442a', '#52301e'], // wooden planks
  ['#6f9fe0', '#4a74b8', '#30508a'],
  ['#3a5cb8', '#2a4290', '#1c2c66'],
  ['#5aa8ff', '#2f6fd0', '#1c4290'],
  ['#5a1a2e', '#40101f', '#2a0814'],
  ['#ffe9a0', '#ffc95a', '#d8903a'],
];
const G_EMBLEM: readonly Duo[] = [
  ['#c8a070', '#8a6a44'],
  ['#e6edf4', '#a2aebd'],
  ['#ffb84a', '#ff7a2a'],
  ['#ffffff', '#9ae8ff'],
  ['#ffe07a', '#e09a2a'],
  ['#ffffff', '#fff2c0'],
];
const G_BLADE: readonly Duo[] = [
  ['#c4bcac', '#7c7468'],
  ['#f2f8ff', '#9aa8bc'],
  ['#fff6d6', '#e0b060'],
  ['#ecfcff', '#7fd0ff'],
  ['#ffe6d6', '#e0604a'],
  ['#ffffff', '#ffe49a'],
];

function guardianPal(t: number): Palette {
  const p = base(t);
  const pl = G_PLUME[t];
  const tb = G_TABARD[t];
  const sh = G_SHIELD[t];
  const em = G_EMBLEM[t];
  const bl = G_BLADE[t];
  return {
    ...p,
    P: pl[0], p: pl[1], q: pl[2],
    C: tb[0], c: tb[1],
    H: sh[0], h: sh[1], i: sh[2],
    E: em[0], F: em[1],
    W: bl[0], w: bl[1],
    e: t >= 3 ? '#bff8ff' : '#ffd890',
    '3': t >= 3 ? TIER_GLOW[t] : em[0],
    Z: '#fff8e0', z: '#ffd89a',
  };
}

const GUARDIAN_IDLE = [
  '........qpPPP.........',
  '......qpPPPPPP........',
  '.....qpPPppPPP........',
  '....qpPp.bAAAAa.......',
  '..W.qp..bAAAAAAa......',
  '.WWwq..bAAAAAAAAa.....',
  '.WWw...baAAAAkkkka....',
  '.WWw...baaAAAAAeka....',
  '.WWw...baaaAAAAAAa....',
  '.WWw...bbaaaaaaaab....',
  '.WWw..2@btTTTTTTt.....',
  '.WWw.@AAAAaTTTTTTTTt..',
  '.WWw.AAAAAaTHHHHHHHt..',
  '.WWwbAAAAabTHHHHHHht..',
  'tTTTtbaaab@THHHEhhit..',
  '.AAAbbbbbCcTHHEEEhit..',
  '.aaab.bCCCcTHHF3Fhit..',
  '..LL..bCCccTHHHEhhit..',
  '..ll.RbLLLlTHHHhhiit..',
  '.....RbCcccTHHhhhiit..',
  '....RRbCcccTHhhhiiit..',
  '....RrbaaabTHhhiiiit..',
  '...RRrbaab.TthiiiiTt..',
  '...Rrr.baa..ttTTTtt...',
  '...rr..bAa..bAa.......',
  '.......bAa..bAa.......',
  '......bbAa..bAab......',
  '......bbbb..bbbbb.....',
];

const G_NO_SWORD = cc(GUARDIAN_IDLE).erase(0, 4, 4, 19, 'WwTtLlAab');

const G_ATTACK1 = cc(G_NO_SWORD.out()).stamp(
  [
    'w........',
    'Ww.......',
    '.Ww......',
    '..Ww.....',
    '...WwT...',
    '....TAA..',
    '...tAAAb.',
    '....aaab.',
    '.....aab.',
    '.....aab.',
  ],
  0,
  0,
);

const G_ATTACK2 = cc(G_NO_SWORD.out())
  .grow(0, 0, 8, 0)
  .stamp(['......zzzZZZZZZZz', '....T............', '..AATWWWWWWWWWWWw', '..aaTwwwwwwwwwww.'], 13, 8);

const G_BASH = cc(GUARDIAN_IDLE)
  .grow(0, 0, 4, 0)
  .move('THhiEFt', 3, 0, 10, 11, 30, 23)
  .stamp(['AAAa', 'aaab'], 10, 15);

export const GUARDIAN: UnitArt = {
  face: 'R',
  ax: 10,
  out: OUTLINE,
  breath: 14,
  glow: 'zZ3',
  pal: guardianPal,
  aura,
  poses: {
    walk: ['walk1', 'walk2'],
    attack: ['attack1', 'attack2'],
    cast: ['cast'],
  },
  maps: {
    idle: GUARDIAN_IDLE,
    walk1: {
      from: 'idle',
      bottom: ['...rr.bAa....bAa......', '.....bAa......bAa.....', '....bbAa......bAab....', '....bbbb......bbbbb...'],
    },
    walk2: {
      from: 'idle',
      bottom: ['...rr...bAabAa........', '........bAabAa........', '.......bbAbbAab.......', '.......bbbbbbbbb......'],
    },
    attack1: G_ATTACK1.out(),
    attack2: G_ATTACK2.out(),
    cast: G_BASH.out(),
    dead: deadMap(G_NO_SWORD.out(), 10, (c, fx, gy) => c.line(fx - 9, gy, fx + 1, gy, 'W').stamp(['T', 't'], fx + 2, gy - 1).plot(fx + 3, gy, 'L')),
  },
};

// ─────────────────────────────── Ranger ───────────────────────────────

const R_HOOD: readonly Tri[] = [
  ['#86a058', '#5c763e', '#384c2a'],
  ['#6ac650', '#40963e', '#26622e'],
  ['#78da5c', '#40a844', '#226a30'],
  ['#74e6bc', '#30aa92', '#1a6a6c'],
  ['#60d466', '#2f9046', '#1a5432'],
  ['#c4ffbc', '#6cdc82', '#34a060'],
];
const R_SCARF: readonly Duo[] = [
  ['#b0604e', '#6e3832'],
  ['#e8523e', '#9c302c'],
  ['#ff8e3a', '#c8501e'],
  ['#86d8ff', '#3a8ad0'],
  ['#ff3c52', '#a01a36'],
  ['#fff2c4', '#ffc24a'],
];
const R_BOW: readonly Duo[] = [
  ['#a87444', '#6a4428'],
  ['#c88c50', '#7a5030'],
  ['#ffd66a', '#c47e1e'],
  ['#e6f8ff', '#6aa8e0'],
  ['#ff5a5a', '#a01a36'],
  ['#fffbe8', '#ffc84a'],
];

function rangerPal(t: number): Palette {
  const p = base(t);
  const h = R_HOOD[t];
  const sc = R_SCARF[t];
  const bw = R_BOW[t];
  return {
    ...p,
    G: h[0], g: h[1], f: h[2],
    Q: sc[0], q: sc[1],
    B: bw[0], N: bw[1],
    y: t >= 3 ? '#e0fbff' : '#e8dcc8', // string
    n: '#c49a62', // shaft
    m: TIER_METAL[Math.max(1, t)][0], // arrow head
    v: '#f4f0e8', // fletching
    '@': t >= 2 ? TIER_TRIM[t][0] : h[1],
    '3': t >= 3 ? TIER_GLOW[t] : TIER_TRIM[t][0],
    Z: '#fffbe8', z: '#c8ffd0',
  };
}

const RANGER_IDLE = [
  '........ggf............',
  '......fgGGGg...........',
  '.....fgGGGGGg..........',
  '....fgGGGGGGGg....BN...',
  '...fgGGG@@@@@@g...y.B..',
  '..ffgGGGgSSSS@g...y.BN.',
  '.ff.fGGgSSSSSs....y..B.',
  '.f..fGGgSSSkSs....y..B.',
  '..vvfgGgSSSSSs....y..BN',
  '.vnnfggsSSSss.....y...B',
  '.lnqQQQqqQQQq.....y...B',
  'qQQQqqQQQQQQqf....y...B',
  'q.lqq.fGGGGgfAa...y..LL',
  '..lRR.fGGGGgAAAa..y.LLN',
  '..lRRfgGGGLLgaAAaaLLLLN',
  '...RRfgGLLGGgg....y...B',
  '...RrfLLGGGGgf....y...B',
  '..RRrLlLLL3LLl....y..BN',
  '..RrrfgGGGGGgf....y..B.',
  '..rr.fgGGgGGgf....y..B.',
  '..r...ggf.ggf.....y.BN.',
  '......dD...dD.....y.B..',
  '......dD...dD.....yBN..',
  '.....ddD...dDd....BN...',
  '.....dddd..dddd........',
];

const R_NO_BOW = cc(RANGER_IDLE).erase(12, 0, 30, 30, 'BNyLAa').erase(13, 12, 17, 14, 'aA');

function drawnBow(c: CharCanvas, released: boolean): void {
  // full draw: bow bent, string to the cheek, arrow nocked
  c.curve(19, 2, 24, 5, 23, 11, 'B').curve(23, 13, 24, 19, 19, 22, 'B');
  c.curve(18, 3, 23, 6, 22, 11, 'N').curve(22, 13, 23, 18, 18, 21, 'N');
  c.stamp(['LL', 'LL', 'LL'], 22, 11);
  c.line(12, 12, 21, 12, 'A').line(12, 13, 21, 13, 'a');
  if (released) {
    c.line(19, 3, 19, 21, 'y');
    c.line(21, 11, 26, 11, 'z').plot(27, 11, 'Z');
    c.stamp(['SS', 'Ss'], 8, 10);
  } else {
    c.line(19, 3, 12, 11, 'y').line(12, 11, 19, 21, 'y');
    c.line(11, 11, 25, 11, 'n').stamp(['m', 'mm', 'm'], 25, 10);
    c.plot(11, 10, 'v').plot(10, 10, 'v').plot(11, 12, 'v');
    c.stamp(['SS', 'Ss'], 12, 10);
  }
}

const R_ATTACK1 = cc(R_NO_BOW.out()).grow(0, 0, 5, 0);
drawnBow(R_ATTACK1, false);
const R_ATTACK2 = cc(R_NO_BOW.out()).grow(0, 0, 5, 0);
drawnBow(R_ATTACK2, true);

// Arrow Rain: bow raised overhead, arrow pointing at the sky
const R_CAST = cc(R_NO_BOW.out()).grow(0, 7, 2, 0);
R_CAST.line(12, 19, 15, 9, 'A').line(13, 19, 16, 9, 'a');
R_CAST.curve(8, 10, 15, 3, 22, 10, 'B').curve(9, 11, 15, 5, 21, 11, 'N');
R_CAST.stamp(['LL', 'LL'], 14, 5);
R_CAST.line(8, 10, 15, 15, 'y').line(15, 15, 22, 10, 'y');
R_CAST.line(15, 15, 15, 1, 'n').stamp(['.m.', 'mmm', '.m.'], 14, 0).plot(14, 15, 'v').plot(16, 15, 'v');
R_CAST.stamp(['SS', 'sS'], 15, 15);

export const RANGER: UnitArt = {
  face: 'R',
  ax: 9,
  out: OUTLINE,
  breath: 12,
  glow: 'zZ3',
  pal: rangerPal,
  aura,
  poses: {
    walk: ['walk1', 'walk2'],
    attack: ['attack1', 'attack2'],
    cast: ['cast'],
  },
  maps: {
    idle: RANGER_IDLE,
    idle2: {
      from: 'idle',
      over: [{ x: 0, y: 9, rows: ['.vnn', ',lnqQQQqq', ',qQQqqQQ', 'qQ,qq.', 'q.l', ',,l'] }],
    },
    walk1: {
      from: 'idle',
      bottom: [
        '......ggf..ggf....y.BN.',
        '.....dD.....dD....y.B..',
        '....dD.......dD...yBN..',
        '...ddD.......dDd..BN...',
        '...dddd......dddd......',
      ],
    },
    walk2: {
      from: 'idle',
      bottom: [
        '.......ggfgf......y.BN.',
        '.......dDdD.......y.B..',
        '.......dDdD.......yBN..',
        '......ddDdDd......BN...',
        '......dddddd...........',
      ],
    },
    attack1: R_ATTACK1.out(),
    attack2: R_ATTACK2.out(),
    cast: R_CAST.out(),
    dead: deadMap(R_NO_BOW.out(), 9, (c, fx, gy) => c.curve(fx - 12, gy, fx - 4, gy - 3, fx + 3, gy, 'B').line(fx - 12, gy, fx + 3, gy, 'y')),
  },
};

// ─────────────────────────────── Arcanist ───────────────────────────────

const A_ROBE: readonly Tri[] = [
  ['#8e70a4', '#644a7c', '#3e2e54'],
  ['#a674dc', '#7648b2', '#482c7a'],
  ['#b474ec', '#7c3ec2', '#4a2084'],
  ['#9c90ff', '#605ada', '#36349a'],
  ['#c658d4', '#862e9c', '#521a6a'],
  ['#ecdaff', '#b896f2', '#7a5cc4'],
];
const A_STAFF: readonly Duo[] = [
  ['#946238', '#5a3a22'],
  ['#a87248', '#64422a'],
  ['#ffd66a', '#c47e1e'],
  ['#e6f8ff', '#6aa8e0'],
  ['#ffd36a', '#c8303f'],
  ['#fffbe8', '#ffc84a'],
];

function arcanistPal(t: number): Palette {
  const p = base(t);
  const rb = A_ROBE[t];
  const st = A_STAFF[t];
  return {
    ...p,
    V: rb[0], v: rb[1], u: rb[2],
    B: st[0], N: st[1],
    O: '#fff6d0', o: '#ff9a3a', x: '#ff5a1e', // ember orb (glow)
    Y: t >= 3 ? '#9ff6ff' : '#ffd66a', // eyes glowing under the brim
    h: '#24182e', // face shadow
    '3': t >= 3 ? TIER_GLOW[t] : TIER_TRIM[t][0],
    Z: '#ffe6a8', z: '#ff8a3a',
  };
}

const ARCANIST_IDLE = [
  '.u....................',
  '.uvu..................',
  '..uvu.................',
  '...uvu................',
  '...uvVu...............',
  '....uvVu.........oo...',
  '....uvVVu.......oOOo..',
  '....uvVVVu......oOxo..',
  '...uvvVVVVu......oo...',
  '...uvTTT3TTu.....NB...',
  '.uuvvvvvvvvvvu...TN...',
  '..uuhhhhhhhuu.....B...',
  '....hhYhhYhh......B...',
  '....uhhhhhhs......B...',
  '...2uvvhhhh.......B...',
  '.R2uvVVvvvVVu...SSB...',
  'Rr.uvVVTvvvVVuSSSsB...',
  'RRruvVVTvvvVVu....B...',
  'Rr.uvVLLLLLvu.....B...',
  'r.uvVVVTvvvvvu....B...',
  '..uvVVVTvvvvvu....B...',
  '.uvVVVVTvvvvvvu...B...',
  '.uvVVVVTvvvvvvu...B...',
  'uvVVVVVTvvvvvvvu..B...',
  'uuvvvvvTvvvvvvuu..B...',
  '.uuu...dd..dd.uu..N...',
];

const A_NO_STAFF = cc(ARCANIST_IDLE).erase(14, 0, 30, 30, 'BNTOoxSs');

function staffAt(c: CharCanvas, x0: number, y0: number, x1: number, y1: number): void {
  c.line(x0, y0, x1, y1, 'B').line(x0 + 1, y0, x1 + 1, y1, 'N');
  c.stamp(['NTN', '.T.'], x1 - 1, y1 - 1);
}

function orb(c: CharCanvas, x: number, y: number, big: number): void {
  if (big >= 2) c.stamp(['..o.o..', '.o...o.', 'o.....o', '.......', 'o.....o', '.o...o.', '..o.o..'], x - 3, y - 3);
  if (big >= 1) c.stamp(['.ooo.', 'oOOOo', 'oOxOo', 'oOOOo', '.ooo.'], x - 2, y - 2);
  else c.stamp(['.oo.', 'oOOo', 'oOxo', '.oo.'], x - 1, y - 1);
}

const A_ATTACK1 = cc(A_NO_STAFF.out()).grow(0, 0, 5, 0);
staffAt(A_ATTACK1, 15, 25, 21, 9);
orb(A_ATTACK1, 21, 6, 0);
A_ATTACK1.line(12, 16, 17, 16, 'v').stamp(['SS', 'Ss'], 17, 15);

const A_ATTACK2 = cc(A_NO_STAFF.out()).grow(0, 0, 6, 0);
staffAt(A_ATTACK2, 16, 25, 22, 9);
orb(A_ATTACK2, 22, 6, 1);
A_ATTACK2.line(12, 16, 18, 16, 'v').stamp(['SS', 'Ss'], 18, 15).plot(26, 4, 'Z').plot(25, 9, 'z').plot(19, 3, 'z');

function arcCast(big: number): string[] {
  const c = cc(A_NO_STAFF.out()).grow(0, 9, 3, 0);
  // both arms raised, staff lifted high above the hat
  c.line(12, 24, 15, 15, 'v').line(11, 24, 14, 15, 'V');
  c.line(16, 26, 16, 6, 'B').line(17, 26, 17, 6, 'N');
  c.stamp(['NTTN', '.TT.'], 15, 5);
  c.stamp(['SS', 'Ss'], 15, 14);
  orb(c, 16, 3, big);
  if (big >= 2) c.plot(10, 1, 'z').plot(22, 2, 'z').plot(12, 7, 'Z').plot(21, 8, 'z');
  return c.out();
}

export const ARCANIST: UnitArt = {
  face: 'R',
  ax: 8,
  out: OUTLINE,
  breath: 15,
  glow: 'OoxYzZ3',
  pal: arcanistPal,
  aura,
  poses: {
    walk: ['walk1', 'walk2'],
    attack: ['attack1', 'attack2'],
    cast: ['cast', 'cast2'],
  },
  maps: {
    idle: ARCANIST_IDLE,
    idle2: {
      from: 'idle',
      over: [{ x: 16, y: 4, rows: ['..o..', '.oOOo', 'oOxOo', '.oOo.', '..o..'] }],
    },
    walk1: {
      from: 'idle',
      bottom: ['.uvVVVVTvvvvvvu...B...', 'uvVVVVVTvvvvvvvu..B...', 'uuvvvvvTvvvvvvuu..B...', '.uuu.dd....dd.uu..N...'],
    },
    walk2: {
      from: 'idle',
      bottom: ['.uvVVVVTvvvvvvu...B...', '.uvVVVVTvvvvvvu...B...', '.uuvvvvTvvvvvuu...B...', '..uuu..dddd.uu....N...'],
    },
    attack1: A_ATTACK1.out(),
    attack2: A_ATTACK2.out(),
    cast: arcCast(1),
    cast2: arcCast(2),
    dead: deadMap(A_NO_STAFF.out(), 8, (c, fx, gy) => c.line(fx - 10, gy, fx + 4, gy, 'B').stamp(['NN', 'NN'], fx + 5, gy - 1)),
  },
};

// ─────────────────────────────── Oracle ───────────────────────────────

const O_ROBE: readonly Tri[] = [
  ['#ece0c6', '#c2b094', '#857660'],
  ['#ffffff', '#d8deee', '#9aa2bc'],
  ['#fffaf0', '#f2dcac', '#c49e5c'],
  ['#f6fdff', '#c2e4f8', '#7aa6d2'],
  ['#fff6f2', '#f2cac2', '#b47070'],
  ['#ffffff', '#fff4d4', '#e8c47a'],
];

function oraclePal(t: number): Palette {
  const p = base(t);
  const rb = O_ROBE[t];
  return {
    ...p,
    W: rb[0], w: rb[1], x: rb[2],
    Y: '#ffe9a0', y: '#d8a44a', // hair
    O: '#fff8d0', o: '#ffd86a', // halo glow
    C: TIER_TRIM[t][0], c: TIER_TRIM[t][1], // crescent
    B: TIER_METAL[t][1], N: TIER_METAL[t][2],
    G: t >= 3 ? '#9ff6ff' : '#ffe08a',
    '3': t >= 3 ? TIER_GLOW[t] : TIER_TRIM[t][0],
    Z: '#fffbe0', z: '#ffe08a',
  };
}

const ORACLE_IDLE = [
  '....oOOOOOo...........',
  '...o.......o.C.......C',
  '....oOOOOOo..Cc.....cC',
  '......yYYy...cCc...cCc',
  '.....yYYYYy...cCCCCCc.',
  '....yYYYSSSs.....cGc..',
  '....yYYSSSkS.....B....',
  '....yYYSSSSs.....B....',
  '...yyYYYSSs......B....',
  '...yyyTWWWWT.....B....',
  '...yyWWWTTTWw....B....',
  '..yy.WWWWwWWWSSSSB....',
  'R.y..xWWW3wWWw...B....',
  'RR...xWWwWwwWw...B....',
  'Rr...xwTTTTTTw...B....',
  'RRr..xWWWwwWWw...B....',
  'Rr..xWWWWwwWWw...B....',
  'rr..xWWWWwwWWw...B....',
  'r..xWWWWWwwWWWw..B....',
  '...xWWWWWwwWWWw..B....',
  '..xWWWWWWwwWWWWw.B....',
  '..xwwTTTTTTTTTTw.B....',
  '..xxwwwwwwwwwwwx.B....',
  '....d.dd...dd....N....',
];

const O_NO_STAFF = cc(ORACLE_IDLE).erase(13, 0, 30, 30, 'BNCcGS');

function crescent(c: CharCanvas, x: number, y: number): void {
  c.stamp(['C.......C', 'Cc.....cC', 'cCc...cCc', '.cCCCCCc.', '...cGc...'], x - 4, y);
}

const O_ATTACK1 = cc(O_NO_STAFF.out()).grow(0, 0, 4, 0);
O_ATTACK1.line(16, 23, 21, 7, 'B').line(17, 23, 22, 7, 'N');
crescent(O_ATTACK1, 22, 2);
O_ATTACK1.line(12, 11, 18, 13, 'W').stamp(['SS', 'Ss'], 18, 12);
O_ATTACK1.plot(26, 1, 'Z').plot(18, 1, 'z').plot(25, 5, 'z');

function oracleCast(): string[] {
  const c = cc(O_NO_STAFF.out()).grow(0, 6, 3, 0);
  c.line(12, 17, 15, 9, 'W').line(13, 17, 16, 9, 'w');
  c.line(16, 25, 16, 6, 'B').line(17, 25, 17, 6, 'N');
  crescent(c, 16, 1);
  c.stamp(['SS', 'sS'], 15, 9);
  // brighter halo
  c.stamp(['...oOOOOOo...', '.oO.......Oo.', '...oOOOOOo...'], 2, 5);
  c.plot(1, 2, 'z').plot(21, 1, 'Z').plot(23, 6, 'z').plot(9, 0, 'z');
  return c.out();
}

export const ORACLE: UnitArt = {
  face: 'R',
  ax: 9,
  out: OUTLINE,
  breath: 12,
  glow: 'OoGzZ3',
  pal: oraclePal,
  aura,
  poses: {
    walk: ['walk1', 'walk2'],
    attack: ['attack1'],
    cast: ['cast'],
  },
  maps: {
    idle: ORACLE_IDLE,
    idle2: { from: 'idle', over: [{ x: 2, y: 0, rows: [',,oOOOOOo,', '.o,......o,', ',,oOOOOOo,'] }] },
    walk1: { from: 'idle', bottom: ['..xwwTTTTTTTTTTw.B....', '..xxwwwwwwwwwwwx.B....', '...d.dd.....dd...N....'] },
    walk2: { from: 'idle', bottom: ['..xwwTTTTTTTTTTw.B....', '...xwwwwwwwwwwx..B....', '.....d.dddd......N....'] },
    attack1: O_ATTACK1.out(),
    cast: oracleCast(),
    dead: deadMap(O_NO_STAFF.out(), 9, (c, fx, gy) => c.line(fx - 10, gy, fx + 3, gy, 'B').stamp(['C..C', '.CC.'], fx + 4, gy - 1)),
  },
};

export const HERO_ART: Record<string, UnitArt> = {
  guardian: GUARDIAN,
  ranger: RANGER,
  arcanist: ARCANIST,
  oracle: ORACLE,
};
