// Normal enemy sprite maps (authored facing LEFT, as they appear on screen).
import type { UnitArt } from '../units.ts';
import { cc } from './draw.ts';

const OUT = '#140c14';

// ─────────────────────────────── Ashwood Hollow ───────────────────────────────

const ASH_CRAWLER: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: OUT,
  breath: 8,
  glow: 'YEe',
  pal: {
    K: '#9a8a84', k: '#64545a', j: '#3a2e36', H: '#4e4048', Y: '#ffd36a', m: '#e0d0b8', l: '#2a2026',
    E: '#ffc060', e: '#ff6a2a',
  },
  maps: {
    idle: [
      '.......kkkk.....',
      '.....kkKKKKkk...',
      '....kKKKKKKKKk..',
      '...kKKeKKKKKKKk.',
      '..HkKKKEeKKKeKkj',
      '.HYkkKKKKKKKKKjj',
      'mHHHjkkkkkkkkjj.',
      'm.HHjjjjjjjjjj..',
      '..l..l...l..l...',
      '.l..l...l..l....',
    ],
    idle2: {
      from: 'idle',
      over: [{ x: 0, y: 3, rows: ['...kKKEKKKKKKKk.', '..HkKKKeEKKKEKkj'] }],
    },
  },
};

const EMBER_WISP: UnitArt = {
  face: 'L',
  out: '#3a0e08',
  glow: 'oYw',
  dead: 'slump',
  pal: { o: '#ffd27a', F: '#ffa040', f: '#e0501e', Y: '#fff2b0', k: '#6a1a0a', w: '#ff7a3a' },
  maps: {
    idle: [
      '.......o.....',
      '......oF.....',
      '.....oFFo....',
      '.....FFFFo...',
      '....FFYYFF...',
      '...FFYYYYFFo.',
      '..FFkYYkYYFF.',
      '..FYkYYkYYFf.',
      '..FYYYYYYYFf.',
      '..fFYYwwYYFf.',
      '...fFYYYYFf..',
      '....fFFFFf...',
      '.....ffff....',
      '......f.f....',
    ],
    idle2: {
      from: 'idle',
      top: ['......o......', '.....oF......', '....oFFo..o..', '.....FFFF....', '...oFFYYFFo..'],
      bottom: ['....fFFFFf...', '.....ffff....', '.....f..f....'],
    },
  },
};

export const WOLF = [
  '....GG..................',
  '...GGFG.................',
  '...GFFFEe...............',
  '..GGFFFFEEe.eEe.e.......',
  '.GYGFFFFFEEEEEEEEe......',
  'GGGGFFFFFFFFEEEEEEe..f..',
  'kFFFFFfFFFFFFFFFFFFfffF.',
  '.WkkFffFFFFFFFFFFFFFfF..',
  '..kkfFfffFFFFFFFFFffF...',
  '.....fffffFFFFffffff....',
  '.....fF.gfgggggggfFf....',
  '.....fF..gf.....gfF.....',
  '....fF...gf.....fF......',
  '...fFg...gf....fFg......',
  '...gg....gg....gg.......',
];

const CHAR_WOLF: UnitArt = {
  face: 'L',
  dead: 'slump',
  out: OUT,
  breath: 10,
  glow: 'YEe',
  pal: {
    G: '#7a6c72', F: '#564a52', f: '#3a3038', g: '#241c24', E: '#ffa040', e: '#e05a1e', Y: '#ffe07a', W: '#f0e8d8', k: '#1a0e10',
  },
  maps: {
    idle: WOLF,
    idle2: { from: 'idle', over: [{ x: 7, y: 2, rows: ['e.E......', '.eEEe.Ee.E', '..EEEEEEEEe'] }] },
    attack1: cc(WOLF)
      .grow(2, 0, 0, 0)
      .stamp(['kFFF', 'WWkF', '..kk', '.WW.'], 0, 6)
      .out(),
  },
  poses: { attack: ['attack1'] },
};

function ashBrute(attack: boolean): string[] {
  const c = cc(24, 24);
  // legs
  c.rect(10, 18, 3, 5, 'g').rect(15, 18, 3, 5, 'g').rect(10, 18, 2, 4, 'G').rect(15, 18, 2, 4, 'G');
  c.rect(9, 22, 4, 2, 'f').rect(14, 22, 5, 2, 'f');
  // torso (hunched, belly forward)
  c.blob(13.5, 11, 7, 7.5, 'HGGgf');
  c.rect(8, 15, 11, 3, 'L').rect(9, 17, 8, 1, 'l').plot(12, 16, 'l').plot(15, 15, 'l');
  // head low in front, horns, tusk
  c.blob(7, 7.5, 3.8, 3.2, 'f').blob(7, 7, 3.5, 3, 'HHGg');
  c.stamp(['h..h', 'hh.hh'], 5, 2).plot(4, 6, 'Y').plot(5, 6, 'k').stamp(['W', 'kW'], 3, 9);
  // ember veins
  c.stamp(['E', 'eE', '.e'], 15, 6).stamp(['e', 'E'], 18, 11).stamp(['E.', '.e'], 11, 12);
  if (!attack) {
    // front arm hanging, club planted on the ground
    c.blob(7, 13, 2.5, 4.2, 'HGg').stamp(['hhh', 'hhh'], 5, 16);
    c.line(5, 16, 1, 22, 'N').line(6, 16, 2, 22, 'n').stamp(['NNN', 'NnnN', 'nnn.'], 0, 21);
  } else {
    // club raised high
    c.grow(0, 7, 0, 0);
    c.blob(10, 11, 2.5, 4, 'HGg').stamp(['hhh', 'hhh'], 9, 6);
    c.line(10, 7, 4, 1, 'N').line(11, 7, 5, 1, 'n').stamp(['.NN.', 'NNnN', 'Nnn.', '.n..'], 2, 0);
  }
  return c.out();
}

const ASH_BRUTE: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 15,
  glow: 'YEe',
  pal: {
    H: '#a08a7c', G: '#7c6a62', g: '#54443e', f: '#352a2a', h: '#d8cbb8', Y: '#ffd36a', W: '#f0e2c8', k: '#1c1012',
    L: '#6a3a2a', l: '#4a2418', N: '#5a3c2a', n: '#36241a', E: '#ffa040', e: '#ff6a2a',
  },
  maps: {
    idle: ashBrute(false),
    attack1: ashBrute(true),
  },
  poses: { attack: ['attack1'] },
};

const CINDER_SAPLING: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 6,
  glow: 'oFYy',
  pal: { o: '#ffd27a', F: '#ff8a3a', Y: '#fff2b0', f: '#c84a1e', N: '#5a3a2a', n: '#3a241c', y: '#ffd36a', k: '#2a1410' },
  maps: {
    idle: [
      '....oFo.....',
      '...oFYFo....',
      '..oFYYYFo.o.',
      '..FFYYYFFoF.',
      '...fFYFFf.F.',
      '....nNNn....',
      '.n.nNykNn.n.',
      '..nNNNNNNn..',
      '....nNNNn...',
      '....NNNNn...',
      '....nNNNn...',
      '...nN..Nn...',
      '..nn...nn...',
    ],
    idle2: { from: 'idle', top: ['.....oo.....', '...oFFo..o..', '..oFYYFo....', '..FFYYYFFoF.'] },
  },
};

// ─────────────────────────────── Drowned Ruins ───────────────────────────────

function reefLurker(attack: boolean): string[] {
  const c = cc(27, 17);
  // legs (behind the shell)
  for (const [x0, y0, x1, y1] of [[17, 12, 21, 16], [20, 11, 25, 15], [22, 10, 26, 13], [12, 13, 10, 16], [14, 13, 14, 16]]) {
    c.line(x0, y0, x1, y1, 'q');
  }
  c.blob(16, 9, 9, 4.5, 'SSssq');
  c.rim('Ss', 'W', 0, -1);
  // coral + barnacles on the shell
  c.stamp(['P.p', 'PpP', '.P.'], 12, 2).stamp(['p.P', '.Pp'], 18, 3).stamp(['B'], 15, 4).stamp(['B'], 21, 6);
  // eye stalks
  c.stamp(['Y.Y', 'k.k', 'q.q'], 8, 3);
  // claws
  if (!attack) {
    c.line(9, 9, 5, 6, 'c').stamp(['..CC..', '.CCcC.', 'CCc.cC', 'Cc....', 'CCc.Cc', '.CCCc.'], 0, 1);
    c.line(9, 12, 6, 12, 'c').stamp(['CCc', 'Cc.', 'CCc'], 3, 11);
  } else {
    c.line(9, 9, 4, 9, 'c').stamp(['.CCCc.', 'CCcc..', 'C.....', 'CCcc..', '.CCCc.'], 0, 7);
    c.line(9, 12, 7, 13, 'c').stamp(['CCc', 'Cc.', 'CCc'], 4, 12);
  }
  return c.out();
}

const REEF_LURKER: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 13,
  dead: 'slump',
  glow: 'Y',
  pal: {
    W: '#7ad0c8', S: '#4a9a9a', s: '#2e6e74', q: '#1c4048', P: '#ff8a8a', p: '#d04a6a', Y: '#e8fff0', k: '#10282c',
    C: '#6ac8b8', c: '#2e7470', B: '#d8d0b8',
  },
  maps: {
    idle: reefLurker(false),
    attack1: reefLurker(true),
  },
  poses: { attack: ['attack1'] },
};

const TIDELING: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 7,
  glow: '',
  pal: {
    F: '#5ae0c8', f: '#2a9a8a', B: '#4aa6c8', b: '#2a6a90', W: '#f0ffff', k: '#0c1c28', m: '#1c3a50', a: '#c8e8d0',
    T: '#c8b07a', t: '#8a6a3a',
  },
  maps: {
    idle: [
      'T.T..Ff.....',
      'TTT.FFf.....',
      '.t.BBBBb....',
      '.tBWkBBBb...',
      '.tBWWBBBbF..',
      '.mmBBBBbbF..',
      '.t.BBbbbb...',
      '.taBBBBbb...',
      '.aaBBbbb.f..',
      '.taBBbbb..f.',
      '.t.BBb.Bb...',
      '.t.Bb..Bb...',
      '..bb..bb....',
    ],
    attack1: [
      '....Ff......',
      '...FFf......',
      'T.BBBBb.....',
      'TTWkBBBb....',
      '.tWWBBBbF...',
      'mmtBBBbbF...',
      '..tBbbbb....',
      '.aatBBbb....',
      'aaBBtbb.f...',
      '.aBBbtb..f..',
      '..BBb.Bb....',
      '..Bb..Bb....',
      '.bb..bb.....',
    ],
  },
  poses: { attack: ['attack1'] },
};

const DROWNED_ARCHER_MAP = [
  '......wWWWw.......',
  '.....wWWWWWw......',
  '....wWWWWWWWw.....',
  '....WkYWWWWWw.....',
  '....WkkWWWWw......',
  '.....WWWwWw.......',
  '.....wWkWw..g.....',
  '..N..gGGGGGgGg....',
  '..NN.GGgGGGGgg....',
  '..N.yWWgGGgGGg....',
  '.N..y.WWGGGgGg....',
  '.N.WWWyWGgGGgg....',
  '.N..y.WGGgGGg.....',
  '.N..y..GGgLLg.....',
  '..N.y..LLLlLL.....',
  '..N.y..GgGGgGg....',
  '..NNy..GgGGggGg...',
  '...N...gGgGgggGg..',
  '.......gG.gGg.gg..',
  '.......wW..wW.....',
  '.......wW..wW.....',
  '.......wW..wW.....',
  '......wWW..wWW....',
];

const DROWNED_ARCHER: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 13,
  glow: 'Y',
  pal: {
    W: '#d8d8c0', w: '#9a9a86', k: '#14201c', Y: '#5affe0', G: '#3a8a7a', g: '#245a52', L: '#5a4a3a', l: '#3a2e24',
    N: '#7a6a4a', y: '#c8d8c8',
  },
  maps: {
    idle: DROWNED_ARCHER_MAP,
    attack1: cc(DROWNED_ARCHER_MAP)
      .erase(0, 7, 6, 18, 'NyW')
      .curve(3, 6, -1, 11, 3, 17, 'N')
      .line(3, 6, 7, 11, 'y')
      .line(7, 11, 3, 17, 'y')
      .line(0, 11, 8, 11, 'y')
      .stamp(['WW'], 6, 10)
      .out(),
  },
  poses: { attack: ['attack1'] },
};

const SIREN_MAP = [
  '.....P.p.P.........',
  '....pPpPpPp........',
  '....HHHHHHHH.......',
  '...HHSSSSHHHh......',
  '...HSkSSSHHHHh.....',
  '...SSSSSSHHHHh.....',
  '...SmSSSHHHHHhh....',
  '....SSSHHHHHHhh....',
  '....SSSSHHHHHhhh...',
  '...SSCCSSHHHHhhh...',
  '..SS.CCSS.HHHhhh...',
  '.SS..SSSS..HHhh....',
  '.S...TTTT...Hh.....',
  '....FFFFFF.........',
  '....FFfFFFf........',
  '....fFFfFFFf.......',
  '.....fFFfFFFf......',
  '......ffFFFFf......',
  '....ff..fFFFf..eE..',
  '..ffFFfffFFFf.eEe..',
  '..fFFFFFFFFf.eE....',
  '..ffFFFFFFFffffe...',
  '...fffffffffff.....',
];

const SIREN: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 11,
  glow: 'Zz',
  dead: 'slump',
  pal: {
    H: '#5ad8c8', h: '#2a8a8a', S: '#c8f0e0', k: '#1a3a40', m: '#6a3a5a', C: '#ff8aa0', P: '#ff9ab0', p: '#d05a80',
    T: '#ffd36a', F: '#4ab0a8', f: '#246a70', e: '#8ae8ff', Z: '#e8fff8', z: '#8afff0',
  },
  maps: {
    idle: SIREN_MAP,
    cast: cc(SIREN_MAP)
      .erase(0, 9, 3, 12, 'S')
      .grow(0, 3, 0, 0)
      .stamp(['Z.z..', '.z.Z.', 'SS...', '.SS..', '..SS.'], 0, 7)
      .stamp(['z..', '.Z.'], 13, 0)
      .out(),
  },
  poses: { attack: ['cast'], cast: ['cast'] },
};

export const ENEMY_ART: Record<string, UnitArt> = {
  ash_crawler: ASH_CRAWLER,
  ember_wisp: EMBER_WISP,
  char_wolf: CHAR_WOLF,
  ash_brute: ASH_BRUTE,
  cinder_sapling: CINDER_SAPLING,
  reef_lurker: REEF_LURKER,
  tideling: TIDELING,
  drowned_archer: DROWNED_ARCHER,
  siren: SIREN,
};
