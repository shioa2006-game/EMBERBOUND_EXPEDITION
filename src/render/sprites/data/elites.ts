// Elite sprites (large, ~30-38 px). Authored facing LEFT.
import type { UnitArt } from '../units.ts';
import { cc, type CharCanvas } from './draw.ts';

// ─────────────────────────────── Thornback Boar ───────────────────────────────

function thornback(charge: boolean): string[] {
  const c = cc(39, 27);
  // legs (far side darker)
  c.rect(27, 19, 4, 7, 'q').rect(12, 19, 4, 7, 'q');
  // body
  c.blob(23, 13, 13, 8, 'GFFfq');
  // thorny bramble back
  const thorns: [number, number, number, number][] = [
    [12, 8, 3, 6], [15, 7, 3, 8], [18, 6, 4, 9], [22, 6, 3, 7], [25, 6, 4, 9], [29, 7, 3, 7], [32, 9, 3, 5],
  ];
  for (const [x, y, w, h] of thorns) c.crystal(x, y, w, h, 'Tt', -1);
  for (const [x, y, , h] of thorns) c.plot(x + 0, y - h + 1, 'E');
  c.stamp(['e', 'E'], 20, 8).stamp(['E', 'e'], 27, 9);
  // near legs + hooves
  c.rect(9, 19, 4, 6, 'f').rect(9, 19, 2, 5, 'F').rect(30, 19, 4, 6, 'f').rect(30, 19, 2, 5, 'F');
  c.rect(9, 25, 4, 2, 'k').rect(30, 25, 4, 2, 'k').rect(12, 25, 4, 2, 'k').rect(27, 25, 4, 2, 'k');
  // head (lowered when charging)
  const hy = charge ? 3 : 0;
  c.blob(8, 14 + hy, 7, 5.6, 'GFFfq');
  c.blob(2.5, 18 + hy, 2.6, 2.4, 'NNn').plot(1, 18 + hy, 'k').plot(3, 18 + hy, 'k');
  c.stamp(['GG.', 'GgG', '.Gg'], 10, 6 + hy);
  c.plot(6, 12 + hy, 'Y').plot(5, 12 + hy, 'y').plot(7, 11 + hy, 'q').plot(6, 11 + hy, 'q').plot(5, 11 + hy, 'q');
  // tusks
  c.curve(5, 20 + hy, -1, 20 + hy, 0, 12 + hy, 'W').curve(6, 20 + hy, 0, 21 + hy, 1, 12 + hy, 'W').curve(7, 20 + hy, 3, 21 + hy, 3, 15 + hy, 'w');
  // tail
  c.stamp(['.f', 'f.', '.f'], 36, 10);
  return c.out();
}

const THORNBACK: UnitArt = {
  face: 'L',
  out: '#140a08',
  breath: 19,
  glow: 'YEe',
  dead: 'slump',
  pal: {
    G: '#8a6450', F: '#6a4a3a', f: '#4a3228', q: '#2a1c18', N: '#a87060', n: '#6a4038', W: '#f4ead8', w: '#b8a890',
    Y: '#ffcf4a', y: '#ff7a2a', T: '#6a5240', t: '#3e2e24', E: '#ffa040', e: '#ff6a2a', k: '#1a100c',
  },
  maps: { idle: thornback(false), attack1: cc(thornback(true)).out() },
  poses: { attack: ['attack1'] },
  lean: 3,
};

// ─────────────────────────────── Coral Knight ───────────────────────────────

function coralKnight(attack: boolean): string[] {
  const c = cc(32, 40);
  // trident in the back hand
  if (!attack) {
    c.line(25, 4, 25, 39, 't').line(24, 4, 24, 39, 'T');
    c.stamp(['T.T.T', 'TTTTT', '.tTt.', '..T..'], 22, 0);
  }
  // cape
  c.poly([[19, 14], [27, 15], [29, 33], [26, 31], [24, 34], [21, 30]], 'B');
  // legs
  c.rect(11, 29, 4, 10, 'c').rect(17, 29, 4, 10, 'd').rect(11, 29, 2, 9, 'C').rect(17, 29, 2, 9, 'c');
  c.rect(10, 38, 6, 2, 'd').rect(16, 38, 6, 2, 'd');
  // torso
  c.blob(16, 21, 7, 8.5, 'CCcd');
  c.stamp(['P.P', '.P.'], 15, 18).plot(19, 23, 'P').plot(13, 24, 'P');
  c.rect(10, 28, 12, 2, 'T').rect(10, 29, 12, 1, 't');
  // pauldrons (coral spikes)
  c.crystal(8, 15, 4, 5, 'Cc', -2).crystal(19, 15, 4, 6, 'Cc', 2).crystal(12, 14, 3, 3, 'Cc', -1);
  // helm with fin crest
  c.blob(14, 10, 5, 5.5, 'CCcd');
  c.stamp(['..F.F.F.', '.FfFfFfF', 'FfFfFfF.', '.fFfFf..'], 12, 1);
  c.stamp(['kkkY.', 'kkk..'], 9, 10);
  c.stamp(['ddd'], 9, 12);
  // shell shield (front)
  const sx = attack ? 3 : 5;
  c.blob(sx, 24, 6, 8.5, 'SSsr');
  for (const dy of [-6, -3, 0, 3, 6]) c.line(sx + 4, 24, sx - 4, 24 + dy, 'r');
  c.stamp(['TT', 'TT'], sx + 3, 23);
  if (attack) {
    // trident thrust forward
    c.line(1, 18, 22, 18, 'T').line(1, 19, 22, 19, 't');
    c.stamp(['T...', 'TTTT', 'T...'], -1, 16).stamp(['T', 'T'], -2, 17);
  }
  return c.out();
}

const CORAL_KNIGHT: UnitArt = {
  face: 'L',
  out: '#160a10',
  breath: 28,
  glow: 'Y',
  pal: {
    C: '#ff9080', c: '#d4505c', d: '#7a2a3e', P: '#ffd0c0', S: '#f2e2ca', s: '#c8a888', r: '#8a6a58', F: '#5ad8c8',
    f: '#2a8a8a', T: '#ffd36a', t: '#b8862a', Y: '#8afff0', k: '#1a0e14', B: '#2a6a7a',
  },
  maps: { idle: coralKnight(false), attack1: coralKnight(true) },
  poses: { attack: ['attack1'] },
};

// ─────────────────────────────── Prism Sentinel ───────────────────────────────

function prismSentinel(charge: number): string[] {
  const c = cc(32, 40);
  // inverted crystal base (hovering)
  c.poly([[11, 29], [21, 29], [16, 39]], 'c').poly([[11, 29], [16, 29], [16, 39]], 'C');
  c.line(16, 30, 16, 37, 'W');
  // torso
  c.blob(16, 21, 8, 8, 'SSsq');
  c.stamp(['.cXc.', 'cXWXc', 'XWWWX', 'cXWXc', '.cXc.'], 14, 18);
  // floating shoulders
  c.crystal(1, 21, 5, 10, 'VvW', -1).crystal(26, 21, 5, 10, 'VvW', 1);
  c.crystal(3, 23, 3, 5, 'Cc', -1).crystal(27, 24, 3, 5, 'Cc', 1);
  // prism head
  c.poly([[9, 13], [23, 13], [16, 0]], 'c').poly([[9, 13], [16, 13], [16, 0]], 'C');
  c.line(16, 1, 16, 12, 'W');
  c.stamp(['.kkk.', 'kYYYk', '.kkk.'], 12, 7);
  if (charge > 0) c.stamp(['..X..', '.X.X.', 'X...X'], 11, -1 + 0).plot(16, 6, 'W');
  return c.out();
}

const PRISM_SENTINEL: UnitArt = {
  face: 'L',
  out: '#0e0a1a',
  glow: 'XYW',
  pal: {
    S: '#5a5a7c', s: '#3a3a56', q: '#1e1e30', C: '#a8f4ff', c: '#3a9ad0', V: '#d8b0ff', v: '#7a4ac8', W: '#ffffff', X: '#d8ffff',
    Y: '#fff0a0', k: '#0e0a1a',
  },
  maps: { idle: prismSentinel(0), cast: prismSentinel(1) },
  poses: { attack: ['cast'], cast: ['cast'] },
};

// ─────────────────────────────── Glacial Warden ───────────────────────────────

function glacialWarden(raise: boolean): string[] {
  const c = cc(36, 40);
  // legs
  c.rect(13, 29, 5, 10, 'a').rect(21, 29, 5, 10, 'q').rect(13, 29, 3, 9, 'A').rect(21, 29, 3, 9, 'a');
  c.rect(12, 38, 7, 2, 'q').rect(20, 38, 7, 2, 'q');
  // body
  c.blob(19, 21, 10, 9, 'AAaq');
  c.rect(11, 27, 16, 2, 'f').rect(11, 27, 16, 1, 'F');
  // fur mantle + chest plate
  c.blob(19, 13, 10, 3, 'FFf');
  c.stamp(['.II.', 'IiiI', '.ij.'], 17, 18);
  // head + ice crown
  c.blob(17, 8, 4.5, 4.5, 'AAaq');
  c.stamp(['kkk', 'YkY', 'kkk'], 13, 7);
  c.crystal(13, 4, 2, 4, 'Ii').crystal(16, 4, 3, 6, 'Ii').crystal(20, 4, 2, 4, 'Ii');
  // back arm
  c.blob(30, 20, 3, 6, 'Aaq');
  // ice hammer
  if (!raise) {
    c.line(6, 14, 6, 32, 'H').line(7, 15, 7, 32, 'h');
    c.rect(1, 31, 12, 8, 'i').rect(1, 31, 12, 2, 'I').rect(1, 31, 2, 8, 'I').rect(10, 33, 3, 6, 'j').rect(3, 38, 10, 1, 'j');
    c.blob(8, 18, 3.2, 5, 'AAaq');
  } else {
    c.grow(0, 8, 0, 0);
    c.line(9, 20, 3, 4, 'H').line(10, 20, 4, 4, 'h');
    c.rect(0, 0, 9, 7, 'i').rect(0, 0, 9, 2, 'I').rect(0, 0, 2, 7, 'I').rect(7, 2, 2, 5, 'j');
    c.blob(10, 22, 3.2, 5, 'AAaq');
  }
  return c.out();
}

const GLACIAL_WARDEN: UnitArt = {
  face: 'L',
  out: '#0a1222',
  breath: 28,
  glow: 'Y',
  pal: {
    A: '#7ea4cc', a: '#486a92', q: '#243652', I: '#eefcff', i: '#86d4ff', j: '#4aa0e0', F: '#e8f0f8', f: '#a4b6cc', Y: '#7af0ff', k: '#0a1222',
    H: '#6a5a4a', h: '#3e3228',
  },
  maps: { idle: glacialWarden(false), attack1: glacialWarden(true) },
  poses: { attack: ['attack1'] },
};

// ─────────────────────────────── Abyssal Herald ───────────────────────────────

function abyssalHerald(cast: boolean): string[] {
  const c = cc(34, 42);
  // tendrils at the hem
  for (const [x0, x1] of [[9, 4], [13, 11], [17, 18], [21, 24], [25, 31]]) c.curve(x0, 33, (x0 + x1) / 2, 38, x1, 41, 'u');
  // robe
  c.poly([[11, 12], [23, 12], [29, 36], [6, 36]], 'V');
  c.poly([[19, 12], [23, 12], [29, 36], [22, 36]], 'v');
  c.line(14, 16, 12, 35, 'v').line(18, 18, 18, 35, 'u');
  c.rect(10, 22, 15, 1, 'G');
  // tendrils from the back
  c.curve(24, 14, 31, 12, 32, 4, 'u').curve(25, 18, 33, 18, 33, 10, 'u');
  // head: hood + many eyes
  c.blob(16, 9, 5, 5, 'vvu');
  c.stamp(['kkkk', 'kYkk', 'kkYk', 'kYkk'], 12, 7).plot(14, 9, 'y');
  // horned crown
  c.curve(12, 5, 6, 3, 7, -3 + 3, 'h').curve(19, 5, 24, 2, 23, 0, 'h');
  c.stamp(['H.H.H'], 13, 3).stamp(['HhHhH'], 13, 4);
  // arm + staff
  if (!cast) {
    c.line(3, 6, 3, 41, 'h').stamp(['.G.', 'GOG', '.G.'], 2, 4);
    c.blob(7, 18, 3, 2.4, 'Vv').stamp(['SS'], 3, 17);
  } else {
    c.grow(0, 4, 0, 0);
    c.line(4, 4, 4, 45, 'h').stamp(['..G..', '.GOG.', 'GOOOG', '.GOG.', '..G..'], 2, 0);
    c.line(6, 21, 4, 12, 'V').stamp(['SS'], 3, 11).plot(0, 2, 'G').plot(8, 1, 'G');
  }
  return c.out();
}

const ABYSSAL_HERALD: UnitArt = {
  face: 'L',
  out: '#050208',
  breath: 22,
  glow: 'YyGO',
  pal: {
    V: '#3e2858', v: '#28183c', u: '#160c24', h: '#8a7aa0', H: '#c8b8d8', Y: '#c8ff6a', y: '#7ad83a', k: '#050208',
    G: '#b4ff6a', O: '#f0ffd0', S: '#5a4a6a',
  },
  maps: { idle: abyssalHerald(false), cast: abyssalHerald(true) },
  poses: { attack: ['cast'], cast: ['cast'] },
};

// ─────────────────────────────── Ember Tyrant ───────────────────────────────

function flameCrown(c: CharCanvas, x: number, y: number): void {
  c.stamp(['F.f.F.f', 'FfFFfFF', 'TTTTTTT'], x, y);
}

function emberTyrant(swing: boolean): string[] {
  const c = cc(36, 40);
  // flame cape
  c.poly([[20, 12], [28, 13], [33, 34], [29, 31], [27, 36], [24, 31], [21, 34]], 'R');
  c.poly([[24, 14], [28, 13], [33, 34], [29, 31]], 'r');
  // legs
  c.rect(13, 29, 4, 10, 'a').rect(20, 29, 4, 10, 'q').rect(13, 29, 2, 9, 'A').rect(20, 29, 2, 9, 'a');
  c.rect(12, 38, 6, 2, 'q').rect(19, 38, 6, 2, 'q');
  // armoured torso with molten cracks
  c.blob(18, 21, 8, 8.5, 'AAaq');
  c.stamp(['e.', '.E', 'E.', '.e'], 15, 17).stamp(['E', '.e', 'E'], 21, 20).stamp(['eEe'], 16, 27);
  c.rect(11, 28, 15, 1, 'T');
  c.crystal(9, 15, 5, 5, 'Aa', -2).crystal(22, 15, 5, 5, 'Aa', 2);
  // head
  c.blob(16, 10, 4.5, 4.5, 'AAaq');
  c.stamp(['kkk', 'YkY'], 12, 10);
  flameCrown(c, 12, 3);
  // greatsword
  if (!swing) {
    c.line(3, 6, 9, 34, 'W').line(4, 6, 10, 34, 'w');
    c.stamp(['.f.', 'fFf', 'FfF'], 2, 3).plot(1, 10, 'f').plot(0, 16, 'F');
    c.stamp(['TTTT'], 6, 23).stamp(['SS', 'SS'], 7, 24);
  } else {
    c.grow(6, 0, 0, 0);
    c.line(0, 18, 18, 18, 'W').line(0, 19, 17, 19, 'w');
    c.stamp(['f.f.f', 'FfFfF'], 1, 16).stamp(['T', 'T', 'T'], 18, 17).stamp(['SS', 'SS'], 19, 18);
  }
  return c.out();
}

const EMBER_TYRANT: UnitArt = {
  face: 'L',
  out: '#120604',
  breath: 28,
  glow: 'YEeFfW',
  pal: {
    A: '#5a4444', a: '#382828', q: '#1c1010', E: '#ffb040', e: '#ff6a2a', Y: '#fff2b0', F: '#ffd27a', f: '#ff8a3a',
    W: '#fff0c8', w: '#ffa040', R: '#d8401e', r: '#8a1e10', T: '#ffd36a', k: '#120604', S: '#5a4444',
  },
  maps: { idle: emberTyrant(false), attack1: emberTyrant(true) },
  poses: { attack: ['attack1'] },
};

export const ELITE_ART: Record<string, UnitArt> = {
  thornback: THORNBACK,
  coral_knight: CORAL_KNIGHT,
  prism_sentinel: PRISM_SENTINEL,
  glacial_warden: GLACIAL_WARDEN,
  abyssal_herald: ABYSSAL_HERALD,
  ember_tyrant: EMBER_TYRANT,
};
