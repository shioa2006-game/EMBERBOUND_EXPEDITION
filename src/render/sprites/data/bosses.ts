// Boss sprites (huge, 52-64 px) and the four shadow heroes of The Hollow Emberbound. Authored facing LEFT
// (shadow heroes reuse the right-facing hero maps and are mirrored).
import type { Palette } from '../pix.ts';
import type { UnitArt } from '../units.ts';
import { cc, type CharCanvas } from './draw.ts';
import { HERO_ART } from './heroes.ts';

type P = readonly [number, number];

function flame(c: CharCanvas, x: number, y: number, big: boolean, alt: boolean): void {
  if (big) c.stamp(alt ? ['.F...', '.fF.F', 'FfYfF', '.fff.'] : ['..F..', '.FfF.', 'FfYfF', '.fff.'], x - 2, y - 3);
  else c.stamp(alt ? ['F.', 'fF'] : ['.F', 'Ff'], x - 1, y - 1);
}

// ─────────────────────────────── Gnarlwood, the Smoldering Elder ───────────────────────────────

function gnarlwood(pose: 'idle' | 'idle2' | 'attack'): string[] {
  const c = cc(64, 66);
  const alt = pose === 'idle2';
  // roots
  c.sweep([24, 56], [13, 60], [3, 65], 3.6, 1, 'bbd');
  c.sweep([30, 58], [27, 62], [22, 65], 3, 1.2, 'bbd');
  c.sweep([40, 58], [44, 62], [48, 65], 3, 1.2, 'bdd');
  c.sweep([44, 54], [54, 59], [62, 64], 3.6, 1, 'bdd');
  // back arm: a branch raised behind
  c.sweep([44, 32], [54, 28], [57, 14], 4.2, 1.6, 'Bbdd');
  c.line(57, 14, 53, 7, 'b').line(57, 14, 61, 8, 'b').line(56, 18, 62, 16, 'b');
  // crown branches
  const crown: [P, P, P, number][] = [
    [[30, 22], [22, 12], [12, 8], 3.2],
    [[32, 20], [30, 10], [24, 2], 3],
    [[35, 20], [38, 9], [36, 1], 2.8],
    [[38, 22], [46, 12], [50, 4], 3],
    [[28, 24], [20, 20], [14, 18], 2.4],
  ];
  for (const [p0, p1, p2, r] of crown) c.sweep(p0, p1, p2, r, 1, 'Bbd');
  // smouldering foliage clusters
  for (const [x, y, s] of [[14, 9, 1], [24, 4, 1], [36, 3, 1], [49, 6, 1], [16, 18, 0.7]]) {
    c.blob(x - 2 * s, y + 1, 2.6 * s, 2 * s, 'LLl').blob(x + 2 * s, y, 2.4 * s, 2.2 * s, 'LLl').blob(x, y - 1, 2 * s, 1.8 * s, 'Ll');
    c.plot(x - 3, y + 2, 'e').plot(x + 3, y + 1, 'e');
  }
  // trunk
  c.blob(33, 40, 13.5, 21, 'BBbbd');
  for (const x of [26, 31, 36, 41]) c.curve(x, 22, x + 2, 40, x - 1, 59, 'd');
  // ember cracks
  c.curve(38, 26, 40, 34, 37, 44, 'e').curve(28, 46, 30, 51, 27, 56, 'e');
  c.plot(39, 30, 'E').plot(29, 50, 'E').plot(38, 40, 'E');
  // flames on the crown
  for (const [x, y, big] of [[12, 6, 1], [24, 1, 1], [36, 0, 1], [50, 3, 1], [14, 15, 0], [53, 7, 0], [61, 8, 0], [44, 10, 0]] as const) {
    flame(c, x, y, big === 1, alt);
  }
  // face
  c.line(21, 28, 27, 29, 'd').line(29, 28, 35, 27, 'd');
  c.stamp(['kkkkk', 'kEYYk', 'kkEkk', '.kkk.'], 20, 30).stamp(['kkkkk', 'kYYEk', 'kkEkk', '.kkk.'], 29, 29);
  c.blob(27.5, 36, 1.8, 1.8, 'Bbd');
  c.stamp(['k.kk.kk.k.', 'kEeYYYeEek', 'kkeEeEeekk', '.kkkkkkkk.'], 20, 40);
  if (alt) c.plot(22, 32, 'Y').plot(31, 31, 'Y').plot(24, 41, 'E');
  // front arm
  if (pose !== 'attack') {
    c.sweep([24, 32], [12, 38], [8, 50], 4.6, 2.4, 'Bbbd');
    c.line(8, 50, 2, 55, 'b').line(8, 50, 5, 57, 'b').line(9, 50, 11, 57, 'b').line(7, 49, 1, 49, 'b');
    c.plot(1, 55, 'E').plot(4, 57, 'e');
  } else {
    c.grow(0, 6, 0, 0);
    c.sweep([24, 38], [10, 32], [8, 12], 4.6, 2.4, 'Bbbd');
    c.line(8, 12, 2, 6, 'b').line(8, 12, 6, 3, 'b').line(9, 12, 13, 4, 'b').line(7, 13, 1, 13, 'b');
    c.plot(2, 6, 'E').plot(6, 3, 'E').plot(13, 4, 'e');
  }
  return c.out();
}

const GNARLWOOD: UnitArt = {
  face: 'L',
  out: '#120806',
  breath: 50,
  glow: 'EeYFf',
  pal: {
    B: '#7a5c48', b: '#523a2e', d: '#2e2018', k: '#160c08', E: '#ffb040', e: '#ff6a2a', Y: '#fff2b0',
    F: '#ffd27a', f: '#ff7a2a', L: '#9a3e1c', l: '#5e2212',
  },
  maps: { idle: gnarlwood('idle'), idle2: gnarlwood('idle2'), attack1: gnarlwood('attack') },
  lean: 3,
  poses: { attack: ['attack1'] },
};

// ─────────────────────────────── Coilscale Matriarch ───────────────────────────────

function coilscale(pose: 'idle' | 'idle2' | 'attack'): string[] {
  const c = cc(64, 62);
  // tail coils, back to front
  c.sweep([48, 42], [62, 36], [59, 20], 4.5, 1, 'SSsq');
  c.sweep([30, 54], [54, 61], [52, 45], 7.5, 5.5, 'SSsq');
  c.sweep([52, 45], [47, 38], [37, 45], 5.5, 4.5, 'SSsq');
  c.sweep([23, 34], [15, 52], [32, 55], 7, 7.5, 'SSsq');
  c.pattern('S', 's', (x, y) => (x * 2 + y * 3) % 7 === 0);
  c.rim('Ssq', 'C', 0, 1);
  c.rim('C', 'C', 0, 1);
  // cobra hood behind the head
  c.blob(25, 15, 9, 11, 'SSsq');
  c.stamp(['.PP.', 'PkkP', '.PP.'], 27, 10).stamp(['.PP.', 'PkkP', '.PP.'], 27, 17);
  // hair
  c.sweep([24, 8], [33, 18], [30, 32], 4, 2, 'Rrr');
  // torso
  c.blob(21, 28, 5.5, 8, 'HHhh');
  c.stamp(['SSsSS', '.SsS.'], 18, 26).stamp(['tTTTt', '.tGt.'], 18, 22);
  // back arm raised (casting)
  c.sweep([25, 24], [31, 19], [33, 12], 1.7, 1.3, 'Hh');
  c.stamp(['TT'], 32, 15);
  // head + crown
  c.blob(19, 13, 4.5, 5, 'HHhh');
  c.plot(16, 12, 'Y').plot(15, 12, 'k').stamp(['GG'], 15, 15);
  c.stamp(['T.T.T.T', 'TGTGTGT', 'ttttttt'], 15, 5);
  if (pose === 'idle2') c.plot(15, 15, 'g').plot(16, 15, 'g');
  if (pose !== 'attack') {
    // trident held upright
    c.line(8, 4, 8, 58, 'T').line(9, 5, 9, 58, 't');
    c.stamp(['T..T..T', 'T..T..T', 'TTTTTTT', '..tTt..'], 5, 0);
    c.sweep([18, 22], [13, 26], [10, 26], 1.7, 1.4, 'Hh');
  } else {
    c.grow(9, 0, 0, 0);
    c.sweep([27, 22], [22, 25], [17, 25], 1.7, 1.4, 'Hh');
    c.line(2, 25, 30, 25, 'T').line(2, 26, 30, 26, 't');
    c.stamp(['TTT', '...', 'TTTT', '...', 'TTT'], 0, 23).stamp(['T', 'T', 'T', 'T', 'T'], 3, 23);
    c.stamp(['gG', 'Gg'], 22, 15);
  }
  return c.out();
}

const COILSCALE: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: '#081414',
  breath: 34,
  glow: 'Y',
  pal: {
    S: '#4ec8a6', s: '#2a9484', q: '#165858', C: '#ece2b4', P: '#ffb04a', H: '#a8ead2', h: '#62b2a2', R: '#1e4c5c', r: '#12303e',
    T: '#ffd36a', t: '#b8862a', G: '#ff5a8a', g: '#8aff6a', Y: '#fff27a', k: '#081414',
  },
  maps: { idle: coilscale('idle'), idle2: coilscale('idle2'), attack1: coilscale('attack') },
  poses: { attack: ['attack1'] },
};

// ─────────────────────────────── Geode Colossus ───────────────────────────────

function geode(pose: 'idle' | 'attack' | 'cast'): string[] {
  const c = cc(64, 62);
  // legs
  c.blob(42, 53, 6, 8, 'rqqk').blob(24, 53, 6.5, 8, 'RRrq');
  c.rect(17, 59, 14, 3, 'r').rect(36, 59, 13, 3, 'q');
  // back arm + fist
  c.sweep([48, 24], [57, 34], [55, 44], 5, 5, 'Rrq');
  c.blob(55, 48, 6, 5.5, 'Rrqq');
  // torso
  c.blob(32, 30, 18, 15.5, 'RRrrq');
  c.pattern('Rr', 'q', (x, y) => (x * 7 + y * 13) % 23 === 0 || (x * 5 + y * 3) % 29 === 0);
  // geode chest
  c.radial(31, 31, 9.5, 8.5, pose === 'cast' ? 'WWXCCcVvvk' : 'WXCcVvvqqk');
  for (const [x, y, w, h, l] of [[23, 33, 3, 5, -1], [36, 34, 3, 4, 1], [27, 37, 3, 3, 0], [33, 26, 2, 3, 1]] as const) c.crystal(x, y, w, h, 'Cc', l);
  // shoulder crystal clusters
  c.crystal(10, 22, 6, 13, 'CcW', -3).crystal(16, 19, 5, 9, 'VvW', -1).crystal(19, 18, 3, 5, 'Cc', 0);
  c.crystal(45, 21, 6, 14, 'CcW', 3).crystal(41, 18, 4, 8, 'VvW', 1);
  // head
  c.blob(31, 13, 6.5, 5.6, 'RRrq');
  c.stamp(pose === 'cast' ? ['YWY.YWY'] : ['kYk.kYk'], 25, 12);
  c.crystal(29, 9, 4, 8, 'CcW', -1);
  // front arm + fist
  if (pose !== 'attack') {
    c.sweep([16, 24], [8, 33], [10, 43], 5.6, 5, 'RRrq');
    c.blob(10, 47, 7.5, 6.5, 'RRrq');
    c.crystal(4, 44, 3, 4, 'Cc', -1).crystal(9, 42, 3, 5, 'Vv', 0);
  } else {
    c.grow(0, 10, 0, 0);
    c.sweep([16, 34], [6, 28], [8, 14], 5.6, 5, 'RRrq');
    c.blob(8, 9, 7.5, 6.5, 'RRrq');
    c.crystal(3, 5, 3, 5, 'Cc', -1).crystal(9, 3, 3, 5, 'Vv', 0);
  }
  return c.out();
}

const GEODE_COLOSSUS: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: '#0e0a16',
  breath: 46,
  glow: 'YWX',
  pal: {
    R: '#7e748e', r: '#564c6a', q: '#302a44', k: '#16121e', C: '#a8f4ff', c: '#3a9ad0', V: '#d8a8ff', v: '#8a4ad8', W: '#ffffff',
    X: '#e8d8ff', Y: '#9ff6ff',
  },
  maps: { idle: geode('idle'), attack1: geode('attack'), cast: geode('cast') },
  poses: { attack: ['attack1'], cast: ['cast'] },
};

// ─────────────────────────────── Rimequeen Isveil ───────────────────────────────

function rimequeen(pose: 'idle' | 'idle2' | 'attack' | 'cast'): string[] {
  const c = cc(56, 66);
  // translucent ice mantle
  c.poly([[30, 17], [42, 22], [54, 64], [34, 64]], 'm');
  // hair flowing behind
  c.sweep([30, 9], [42, 20], [44, 42], 5.2, 2.5, 'Wwj');
  // gown
  c.poly([[22, 30], [34, 30], [50, 64], [6, 64]], 'g');
  c.poly([[22, 30], [27, 30], [16, 64], [6, 64]], 'G');
  c.poly([[31, 30], [34, 30], [50, 64], [38, 64]], 'j');
  for (const [x0, x1] of [[26, 22], [28, 30], [30, 38]]) c.line(x0, 34, x1, 62, 'j');
  // icicle hem
  for (let x = 6; x <= 50; x += 3) c.line(x, 61, x + 1, 65 - ((x / 3) % 2), 'i').plot(x + 1, 61, 'I');
  // bodice
  c.blob(28, 24, 5, 7, 'BBbJ');
  c.stamp(['.I.', 'IiI', '.I.'], 27, 22);
  // head
  c.blob(26.5, 12.5, 5.2, 5.8, 'w');
  c.blob(26, 12, 4.6, 5.2, 'HHHh');
  c.stamp(['www', 'w..'], 23, 8);
  c.plot(23, 12, 'Y').plot(22, 12, 'k').plot(24, 11, 'k').plot(23, 15, 'p').plot(22, 15, 'p');
  // icicle crown
  c.crystal(20, 8, 2, 5, 'Ii').crystal(23, 7, 3, 9, 'Ii').crystal(27, 7, 2, 7, 'Ii').crystal(30, 8, 2, 4, 'Ii');
  c.rect(21, 7, 11, 1, 'T');
  // back arm
  c.sweep([32, 20], [37, 27], [38, 31], 1.5, 1.2, 'Hh');
  if (pose === 'cast') {
    c.grow(0, 8, 0, 0);
    c.sweep([23, 27], [18, 20], [17, 12], 1.6, 1.3, 'Hh');
    c.line(16, 2, 16, 40, 'I').line(17, 3, 17, 40, 'i');
    c.stamp(['..I..', 'I.I.I', '.III.', 'IIXII', '.III.', 'I.I.I', '..I..'], 14, 0);
    for (const [x, y] of [[8, 4], [26, 2], [6, 14], [28, 10], [10, 22]]) c.plot(x, y, 'z');
  } else if (pose === 'attack') {
    c.grow(8, 0, 0, 0);
    c.sweep([31, 22], [24, 22], [19, 20], 1.6, 1.3, 'Hh');
    c.line(1, 20, 22, 20, 'I').line(2, 21, 22, 21, 'i');
    c.stamp(['..I', '.II', 'IXI', '.II', '..I'], 0, 18);
    c.stamp(['z..z', '.z..', 'z..z'], 0, 12);
  } else {
    c.sweep([24, 21], [15, 25], [11, 23], 1.6, 1.3, 'Hh');
    c.line(10, 6, 10, 64, 'I').line(11, 7, 11, 64, 'i');
    c.stamp(['..I..', 'I.I.I', '.III.', 'IIXII', '.III.', 'I.I.I', '..I..'], 8, 0);
    if (pose === 'idle2') c.plot(6, 2, 'z').plot(15, 7, 'z');
    else c.plot(15, 1, 'z').plot(6, 8, 'z');
  }
  return c.out();
}

const RIMEQUEEN: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: '#0a1426',
  breath: 32,
  glow: 'YXz',
  pal: {
    G: '#dcf2ff', g: '#8cc2ec', j: '#4a78b6', J: '#283e78', m: '#bfe8ff60', H: '#e6eef8', h: '#9cb2d0', W: '#ece8ff',
    w: '#a8a0d8', I: '#eefcff', i: '#86d4ff', B: '#5e8ed4', b: '#3e66a8', Y: '#7af0ff', k: '#0c1424', p: '#8aa0d0',
    T: '#e0f0ff', X: '#ffffff', z: '#e8fcff',
  },
  maps: { idle: rimequeen('idle'), idle2: rimequeen('idle2'), attack1: rimequeen('attack'), cast: rimequeen('cast') },
  poses: { attack: ['attack1'], cast: ['cast'] },
};

// ─────────────────────────────── The Hollow Sovereign ───────────────────────────────

function sovereign(pose: 'idle' | 'idle2' | 'attack' | 'cast'): string[] {
  const c = cc(66, 68);
  const alt = pose === 'idle2';
  // tendrils from beneath the cape
  for (const [x0, cx, x1, s] of [[14, 6, 2, 1], [22, 18, 12, -1], [36, 40, 42, 1], [48, 56, 63, 1], [30, 28, 24, -1]] as const) {
    const wob = alt ? s * 2 : 0;
    c.sweep([x0, 56], [cx + wob, 62], [x1 + wob, 67], 2.2, 0.6, 'vu');
    c.plot(x1 + wob, 67, 'G');
  }
  // cape with tattered hem
  c.poly(
    [[20, 16], [46, 16], [62, 60], [56, 57], [52, 64], [46, 58], [40, 65], [34, 58], [28, 65], [22, 58], [14, 64], [10, 57], [4, 61]],
    'V',
  );
  c.poly([[38, 16], [46, 16], [62, 60], [56, 57], [52, 64], [46, 58]], 'v');
  for (const [x0, x1] of [[24, 14], [30, 26], [42, 48], [36, 40]]) c.line(x0, 24, x1, 58, 'u');
  // armour in the cape opening
  c.poly([[25, 22], [38, 22], [36, 50], [27, 50]], 'A');
  for (let y = 26; y <= 46; y += 4) c.line(27, y, 35, y, 'a');
  c.line(31, 23, 31, 49, 'a');
  // shoulder spikes
  c.crystal(13, 24, 6, 10, 'Aa', -4).crystal(44, 24, 6, 10, 'Aa', 4);
  // head: dark helm with one huge eye
  c.blob(31, 13, 8.5, 8.5, 'AAau');
  c.blob(31, 14, 6.4, 4.4, 'k');
  c.blob(31, 14, 5.6, 3.6, 'E');
  c.radial(30, 14, 2.8, 2.8, pose === 'cast' ? 'YGGg' : 'PGGg');
  c.line(30, 12, 30, 16, 'P').plot(29, 12, 'Y');
  // crown
  c.rect(22, 5, 19, 2, 'T').rect(22, 6, 19, 1, 't');
  for (const [x, h, l] of [[21, 8, -2], [25, 11, -1], [30, 14, 0], [35, 11, 1], [39, 8, 2]]) c.crystal(x, 6, 3, h, 'TtT', l);
  c.plot(26, 6, 'G').plot(31, 6, 'G').plot(36, 6, 'G').plot(31, -4 + 4, 'G');
  // arms + void scepter
  if (pose === 'attack') {
    c.grow(10, 0, 0, 0);
    c.sweep([36, 26], [26, 30], [20, 28], 2, 1.6, 'Aau');
    c.line(0, 27, 24, 27, 'S').line(1, 28, 24, 28, 's');
    c.stamp(['.GG.', 'GOOG', 'GOOG', '.GG.'], 24, 25);
    c.stamp(['zz...', '..zzz'], 2, 23);
  } else if (pose === 'cast') {
    c.grow(0, 8, 0, 0);
    c.sweep([27, 34], [18, 26], [16, 14], 2, 1.6, 'Aau').sweep([37, 34], [46, 26], [48, 14], 2, 1.6, 'Aau');
    c.line(16, 14, 13, 10, 'a').line(16, 14, 17, 9, 'a').line(48, 14, 45, 9, 'a').line(48, 14, 51, 10, 'a');
    c.radial(32, 4, 4, 4, 'OGGg');
    for (const [x, y] of [[20, 2], [44, 3], [10, 20], [54, 18], [26, 0], [40, 0]]) c.plot(x, y, 'z');
  } else {
    c.sweep([26, 26], [16, 32], [12, 40], 2, 1.6, 'Aau');
    c.line(7, 6, 11, 64, 'S').line(8, 6, 12, 64, 's');
    c.stamp(['.GG.', 'GOOG', 'GOOG', '.GG.'], 5, 1);
    c.stamp(['aa', 'aa'], 10, 39);
    if (alt) c.plot(2, 4, 'z').plot(13, 0, 'z');
    else c.plot(3, 0, 'z').plot(12, 5, 'z');
  }
  return c.out();
}

const HOLLOW_SOVEREIGN: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: '#040206',
  breath: 52,
  glow: 'GOYz',
  pal: {
    V: '#2e1a46', v: '#1e1030', u: '#110818', k: '#040206', A: '#4e4468', a: '#2e2842', E: '#eaffd8', G: '#b4ff6a', g: '#4ea82a',
    P: '#040206', Y: '#f0ffd0', T: '#b0a070', t: '#5a4a2a', S: '#3a3054', s: '#221a34', O: '#e8ffc0', z: '#b4ff6a',
  },
  maps: { idle: sovereign('idle'), idle2: sovereign('idle2'), attack1: sovereign('attack'), cast: sovereign('cast') },
  poses: { attack: ['attack1'], cast: ['cast'] },
};

// ─────────────────────────────── Shadow heroes (The Hollow Emberbound) ───────────────────────────────

/** Dark violet silhouette palette with ember cracks and glowing eyes, applied over a hero's material chars. */
function shadowPalette(hero: string): Palette {
  const deep = '#1a1028';
  const mid = '#2e1e44';
  const hi = '#4a3466';
  const crack = '#ff8a3d';
  const eye = '#ff5ad0';
  const base: Palette = {
    A: hi, a: mid, b: deep, T: crack, t: '#a8401e', '2': crack, '@': mid, '3': crack, R: '#3a1a40', r: '#24102a',
    S: hi, s: mid, k: '#0a0610', L: mid, l: deep, d: deep, D: mid, Z: '#ffb070', z: crack,
  };
  switch (hero) {
    case 'guardian':
      return { ...base, P: crack, p: '#d04a1e', q: '#7a2010', C: mid, c: deep, H: hi, h: mid, i: deep, E: crack, F: '#a8401e', W: hi, w: mid, e: eye };
    case 'ranger':
      return { ...base, G: hi, g: mid, f: deep, Q: crack, q: '#a8401e', B: hi, N: mid, y: '#8a5a9a', n: mid, m: crack, v: '#8a5a9a', k: eye };
    case 'arcanist':
      return { ...base, V: hi, v: mid, u: deep, B: hi, N: mid, O: '#ffd0f0', o: '#d040a0', x: '#ff5ad0', Y: eye, h: '#0a0610' };
    default:
      return { ...base, W: hi, w: mid, x: deep, Y: hi, y: mid, O: '#ff9ae0', o: '#c03aa0', C: crack, c: '#a8401e', B: mid, N: deep, G: eye, k: eye };
  }
}

function shadowOf(hero: string): UnitArt {
  const src = HERO_ART[hero];
  return {
    ...src,
    pal: shadowPalette(hero),
    aura: undefined,
    scale: 1.5,
    flip: true,
    out: '#050208',
    glow: (src.glow ?? '') + (hero === 'oracle' ? 'Gk' : hero === 'ranger' ? 'k' : hero === 'guardian' ? 'e' : 'Y'),
  };
}

export const BOSS_ART: Record<string, UnitArt> = {
  gnarlwood: GNARLWOOD,
  coilscale: COILSCALE,
  geode_colossus: GEODE_COLOSSUS,
  rimequeen: RIMEQUEEN,
  hollow_sovereign: HOLLOW_SOVEREIGN,
  shadow_guardian: shadowOf('guardian'),
  shadow_ranger: shadowOf('ranger'),
  shadow_arcanist: shadowOf('arcanist'),
  shadow_oracle: shadowOf('oracle'),
};
