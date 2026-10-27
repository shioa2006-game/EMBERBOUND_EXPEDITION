// Normal enemies of the deeper areas (Glimmerdeep, Rimeholt, The Hollow, The Ember Heart). Authored facing LEFT.
import type { UnitArt } from '../units.ts';
import { cc } from './draw.ts';
import { WOLF } from './enemies.ts';

const OUT = '#140c14';

// ─────────────────────────────── Glimmerdeep ───────────────────────────────

function shardback(): string[] {
  const c = cc(25, 17);
  // stubby legs
  c.rect(8, 13, 3, 3, 'q').rect(17, 13, 3, 3, 'q').rect(9, 13, 2, 2, 'b').rect(18, 13, 2, 2, 'b');
  c.blob(14, 10, 9.5, 4.5, 'BBbq');
  // head + snout
  c.blob(4, 11, 3.5, 2.6, 'BBbq').plot(2, 10, 'Y').plot(0, 12, 'q').plot(1, 12, 'b');
  // crystal shards along the back
  c.crystal(7, 8, 3, 4, 'CcW', -1).crystal(10, 7, 4, 7, 'CcW', -1).crystal(14, 7, 3, 5, 'VvW', 0).crystal(17, 8, 4, 6, 'CcW', 1).crystal(21, 9, 2, 3, 'Vv', 1);
  return c.out();
}

const SHARDBACK: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 9,
  dead: 'slump',
  glow: 'Y',
  pal: {
    B: '#6a5a78', b: '#463a56', q: '#2a2238', Y: '#d8a8ff', C: '#8af0ff', c: '#3aa0d0', W: '#f0ffff', V: '#c890ff', v: '#7a48c8',
  },
  maps: { idle: shardback() },
};

const GEM_BAT: UnitArt = {
  face: 'L',
  out: OUT,
  glow: 'Ye',
  dead: 'slump',
  pal: { W: '#6a4a8a', w: '#3e2a58', G: '#7af0ff', g: '#2a9ac8', Y: '#ffe0ff', e: '#c890ff', k: '#1a1028' },
  maps: {
    idle: [
      'W..............W',
      'WW....e..e....WW',
      'WWW..wGGGGw..WWW',
      'wWWWwGYGGYGwWWWw',
      'wwWWWGGGggGWWWww',
      '.wwWWWGggGWWWww.',
      '..ww.wwGgww.ww..',
      '.......Gg.......',
      '.......g........',
    ],
    idle2: [
      '................',
      '......e..e......',
      '....wwGGGGww....',
      '..wWWGYGGYGWWw..',
      '.wWWWGGGggGWWWw.',
      'wWWWwwGggGwwWWWw',
      'WWw...wGgw...wWW',
      'Ww.....Gg.....wW',
      'W......g.......W',
    ],
  },
};

const CRYSTAL_MITE: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 6,
  dead: 'slump',
  glow: 'XY',
  pal: { C: '#ff9ad8', c: '#b04a9a', W: '#fff0fa', X: '#ffffff', h: '#5a4a6a', Y: '#ffd36a', m: '#c8b8d8', l: '#2a2034' },
  maps: {
    idle: [
      '........cCc...',
      '......cCCWCc..',
      '.....cCCWXCCc.',
      '..hh.cCCCCCCc.',
      '.hYhhcCCCCCcc.',
      'mhhhhhccccccc.',
      'm.l.l..l..l...',
      '..l..l..l..l..',
    ],
    idle2: {
      from: 'idle',
      over: [{ x: 5, y: 0, rows: ['...cCc', '.cCCWCc', 'cCCWCXCc'] }],
    },
  },
};

function geomancer(cast: boolean): string[] {
  const c = cc([
    '......hhh.........',
    '.....hHHHh........',
    '....hHHHHHh.......',
    '...hHHkkkHHh......',
    '...hHkYkkHHh......',
    '...hHkkkkHHh......',
    '..CchHkkHHHhh.....',
    '.CCchRRRRRRhhcC...',
    '.cc.RRRRRRRRhcCC..',
    '...RRrRRRRRRrhcc..',
    '..SSrRRRRRrRRr....',
    '..SrRRRRRRRrRr....',
    '....RRrLLLLRrr....',
    '....RRrRRRrRRrr...',
    '...RRrRRRrRRRrr...',
    '...RRrRRRrRRRrrr..',
    '..RRrRRRRrRRRrrr..',
    '..RRrRRRRrRRRrrrr.',
    '.RRrRRRRRrRRRRrrr.',
    '.rrrrrrrrrrrrrrrr.',
    '...dd.....dd......',
  ]);
  if (!cast) {
    // staff with a floating crystal
    c.line(2, 9, 2, 20, 'N').crystal(1, 7, 3, 4, 'XxW').plot(0, 3, 'z').plot(4, 2, 'z');
  } else {
    c.grow(0, 4, 0, 0);
    c.line(3, 4, 3, 15, 'N').stamp(['SS', 'Sr'], 2, 13);
    c.crystal(1, 3, 4, 6, 'XxW').plot(0, 0, 'Z').plot(6, 1, 'z').plot(6, 6, 'Z');
  }
  return c.out();
}

const GEOMANCER: UnitArt = {
  face: 'L',
  out: OUT,
  breath: 12,
  glow: 'YXxZzW',
  pal: {
    h: '#3a2a4a', H: '#5a4470', k: '#140c1c', Y: '#d890ff', R: '#6a4a7a', r: '#46304e', L: '#c8a050', S: '#b89a88',
    C: '#8af0ff', c: '#3aa0d0', N: '#5a4030', X: '#d8b0ff', x: '#9a60f0', W: '#ffffff', Z: '#f0e0ff', z: '#b890ff', d: '#2a1e30',
  },
  maps: { idle: geomancer(false), cast: geomancer(true) },
  poses: { attack: ['cast'], cast: ['cast'] },
};

// ─────────────────────────────── Rimeholt Citadel ───────────────────────────────

const FROST_REVENANT_MAP = [
  '..s.........s.....',
  '..Ss.......sS.....',
  '...SsSAAAASsS.....',
  '....AAAAAAAa......',
  '....AkYkkAAa......',
  '....AkkkkAAa......',
  '.....aAAAaaa......',
  '...IiAAAAAAAaiI...',
  '..IIiAAaAAAAaiII..',
  '..Ii.aAAaAAAa.iI..',
  '..Ii.AAaaAAaa.ii..',
  '.WWW.aAAaAAaaKq...',
  '..W..TTTTTTTTKqq..',
  '..W..aAAaaAAaKqq..',
  '..W..aAAa.aAaKqqq.',
  '..W..aAa..aAaKqqq.',
  '..W..aAa..aAa.qqq.',
  '..W..aAa..aAa.qq..',
  '..w..aAa..aAa.....',
  '..w.aaAa.aaAa.....',
  '....aaaa.aaaa.....',
];

const FROST_REVENANT: UnitArt = {
  face: 'L',
  out: '#0c1424',
  breath: 11,
  glow: 'Y',
  pal: {
    A: '#9ab8d8', a: '#5a7898', s: '#e8fbff', S: '#a8e0ff', k: '#0c1424', Y: '#7af0ff', I: '#d8f6ff', i: '#7ac0e8',
    W: '#e0f8ff', w: '#7ab8e0', T: '#c8d8e8', K: '#3a5a8a', q: '#24385a',
  },
  maps: {
    idle: FROST_REVENANT_MAP,
    attack1: cc(FROST_REVENANT_MAP).erase(0, 11, 3, 20, 'Ww').grow(4, 0, 0, 0).line(0, 9, 7, 9, 'W').line(0, 10, 6, 10, 'w').stamp(['II'], 6, 9).out(),
  },
  poses: { attack: ['attack1'] },
};

const RIME_ARCHER_MAP = [
  '......FFFF........',
  '.....FffffF.......',
  '....FfHHHHfF......',
  '....fHHSSHHf......',
  '....fHSkSSHf......',
  '....fHSSSSHf......',
  '.....fHSSHf.......',
  '..b...FFFFFFf.....',
  '..bB.HHHHHHHHh....',
  '..b.yHHhHHHHhh....',
  '.b..y.HHHHHhhh....',
  '.b.SSySHHHHhhh....',
  '.b..y.HHHhHhh.....',
  '.b..y..HHLLhh.....',
  '..b.y..LLLlLL.....',
  '..b.y..HHhHHhh....',
  '..bBy..HhHHhhHh...',
  '...b...hHhHhhhHh..',
  '.......hH.hHh.hh..',
  '.......dD..dD.....',
  '.......dD..dD.....',
  '......ddD.ddDD....',
];

const RIME_ARCHER: UnitArt = {
  face: 'L',
  out: '#0c1424',
  breath: 12,
  glow: '',
  pal: {
    F: '#f4fbff', f: '#b8d0e0', H: '#5a8ac8', h: '#34588a', S: '#e8d8d0', k: '#14202e', b: '#bff0ff', B: '#ffffff',
    y: '#e0f8ff', L: '#c8d8e8', l: '#7a98b8', d: '#2a3448', D: '#4a5a78',
  },
  maps: {
    idle: RIME_ARCHER_MAP,
    attack1: cc(RIME_ARCHER_MAP)
      .erase(0, 7, 6, 18, 'bByS')
      .curve(3, 6, -1, 11, 3, 17, 'b')
      .line(3, 6, 7, 11, 'y')
      .line(7, 11, 3, 17, 'y')
      .line(0, 11, 8, 11, 'B')
      .stamp(['SS'], 6, 10)
      .out(),
  },
  poses: { attack: ['attack1'] },
};

const ICE_WRAITH_MAP = [
  '....I.I.I...........',
  '....IiIiI...........',
  '...hHHHHHh..........',
  '..hHHkkkHHh.........',
  '..hHkYkYkHHh........',
  '..hHkkkkkHHhh.......',
  '...hHkkkHHHhh.......',
  '.C..hHHHHHHhhh......',
  'CCc.HHHHHHHHhhh.....',
  '.CCcHHHHHHHHHhh.....',
  '..CCcHHHHHHHHhhh....',
  '...ccHHHhHHHHhhh....',
  '.....HHHhHHHHhhhh...',
  '.....hHHhHHHhhhhh...',
  '......hHhhHHhhhhhh..',
  '......hhhhHhhh.hhh..',
  '.......hh.hhh...hhh.',
  '.......h...hh....hh.',
  '...........h......h.',
];

const ICE_WRAITH: UnitArt = {
  face: 'L',
  out: '#0a1626',
  glow: 'Yz',
  dead: 'slump',
  pal: {
    I: '#e8fcff', i: '#8ad8ff', H: '#8ac0e8', h: '#4a78a8', k: '#0a1626', Y: '#bff8ff', C: '#d8f6ff', c: '#7ab8e0', z: '#e8fcff',
  },
  maps: {
    idle: ICE_WRAITH_MAP,
    idle2: {
      from: 'idle',
      bottom: ['......hhhhHhhh.hhh..', '.......hh.hhh..hhh..', '........h..hh...hh..', '............h....h..'],
    },
    cast: cc(ICE_WRAITH_MAP).grow(0, 2, 0, 0).erase(0, 9, 4, 14, 'Cc').stamp(['z.C..', '.CCc.', 'CCc..', '.Cc..'], 0, 5).plot(1, 2, 'z').out(),
  },
  poses: { attack: ['cast'], cast: ['cast'] },
};

const HOUND_SPIKES = ['..E...E', '.EeE.EeE.E', 'EeeeEeeeEeE'];

const FROST_HOUND: UnitArt = {
  face: 'L',
  out: '#0c1424',
  breath: 10,
  dead: 'slump',
  glow: 'Y',
  pal: {
    G: '#f0f8ff', F: '#b8d0e8', f: '#7a98c0', g: '#4a6088', E: '#e8fcff', e: '#7ad8ff', Y: '#7af0ff', W: '#ffffff', k: '#0c1424',
  },
  maps: {
    idle: cc(WOLF).swap({ E: 'e' }).stamp(HOUND_SPIKES, 7, 1).out(),
    attack1: cc(WOLF).swap({ E: 'e' }).stamp(HOUND_SPIKES, 7, 1).grow(2, 0, 0, 0).stamp(['kFFF', 'WWkF', '..kk', '.WW.'], 0, 6).out(),
  },
  poses: { attack: ['attack1'] },
};

// ─────────────────────────────── The Hollow ───────────────────────────────

function voidspawn(open: boolean): string[] {
  const c = cc(23, 19);
  // tendril legs
  for (const [x0, x1] of [[6, 3], [9, 8], [13, 13], [17, 19], [20, 22]]) c.curve(x0, 12, (x0 + x1) / 2 + 1, 15, x1, 18, 't');
  c.blob(13, 9, 9, 7, 'VVvu');
  // spikes on the back
  c.stamp(['.u', 'uv'], 12, 0).stamp(['u.', 'vu'], 16, 1).stamp(['u', 'v'], 19, 3);
  // maw
  if (open) c.stamp(['.kkkk', 'kWkWk', 'kkkkk', 'kWkWk', '.kkkk'], 2, 7);
  else c.stamp(['..kkk', 'kWkWk', 'kkkkk', '..kk.'], 3, 8);
  // eyes
  c.plot(7, 4, 'Y').plot(10, 3, 'Y').plot(9, 6, 'y').plot(12, 5, 'y');
  return c.out();
}

const VOIDSPAWN: UnitArt = {
  face: 'L',
  out: '#06030a',
  breath: 12,
  dead: 'slump',
  glow: 'Yy',
  pal: { V: '#4a2a6a', v: '#2e1a46', u: '#1a0e2a', t: '#2a1a3a', k: '#06030a', W: '#d8ffb0', Y: '#c8ff6a', y: '#7ad83a' },
  maps: { idle: voidspawn(false), attack1: voidspawn(true) },
  poses: { attack: ['attack1'] },
};

const GLOOM_CASTER_MAP = [
  '.......uu.........',
  '......uVVu........',
  '.....uVVVVu.......',
  '....uVVkkkVu......',
  '....uVkYkYVu......',
  '....uVkkkkVuu.....',
  '.....uVkkVVuu.....',
  '....uVVVVVVVuu....',
  '...uVVvVVVVVvuu...',
  '..SS.VVvVVVVvuu...',
  '.SS..VVvVVVvVuu...',
  '.....VVvVVVvVVu...',
  '....uVVvVVvVVVuu..',
  '....uVvVVVvVVVuu..',
  '...uVVvVVVvVVVVuu.',
  '...uVvVVVvVVVVVuu.',
  '..uVVvVVvVVVVVVvuu',
  '..uVvVuVvuVVvVuvu.',
  '..u.vu.u..uv.u..u.',
];

const GLOOM_CASTER: UnitArt = {
  face: 'L',
  out: '#06030a',
  breath: 9,
  glow: 'YOoz',
  pal: { V: '#3a2850', v: '#28183a', u: '#180e26', k: '#06030a', Y: '#c8ff6a', S: '#7a6a8a', O: '#eaffc0', o: '#8ae03a', z: '#c8ff6a' },
  maps: {
    idle: cc(GLOOM_CASTER_MAP).stamp(['.o.', 'oOo', '.o.'], 0, 6).out(),
    idle2: cc(GLOOM_CASTER_MAP).stamp(['oOo', 'OOO', 'oOo'], 0, 6).out(),
    cast: cc(GLOOM_CASTER_MAP).grow(0, 3, 0, 0).erase(0, 12, 3, 13).stamp(['.z.o.', 'z.oOo', '.oOOO', '..oOo', '.SS..', 'SS...'], 0, 4).out(),
  },
  poses: { attack: ['cast'], cast: ['cast'] },
};

const HOLLOW_KNIGHT_MAP = [
  '..h.......h.......',
  '..hh.....hh.......',
  '...hAAAAAh........',
  '...AAAAAAAa.......',
  '...AYYYAAAa.......',
  '...AkkkAAAa.......',
  '...aAAAAAaa.......',
  '..aAAaaaaAaaR.....',
  '.aAAAAaAAAAaRR....',
  '.aAaAAAaAAAaRRr...',
  '.aAaaAAaAAaaRRr...',
  '.aAaaAAaaAaaRRrr..',
  '.TTTTTTTTTTTRrrr..',
  '..aAAaaAAaa.Rrrr..',
  '..aAAa.aAAa.Rr.r..',
  '..aAa...aAa.R..r..',
  '..aAa...aAa.r.....',
  '..aAa...aAa.......',
  '.aaAa..aaAa.......',
  '.aaaa..aaaa.......',
];

function hollowKnight(attack: boolean): string[] {
  const c = cc(HOLLOW_KNIGHT_MAP).grow(3, 0, 0, 0);
  if (!attack) {
    c.line(2, 4, 2, 17, 'W').line(3, 5, 3, 17, 'w').stamp(['tTt', '.g.', '.g.'], 1, 17);
    c.stamp(['GGG'], 3, 9);
  } else {
    c.line(0, 9, 8, 9, 'W').line(0, 10, 7, 10, 'w').stamp(['t', 'T', 't'], 8, 8).stamp(['GG'], 9, 9);
  }
  return c.out();
}

const HOLLOW_KNIGHT: UnitArt = {
  face: 'L',
  out: '#06030a',
  breath: 12,
  glow: 'Y',
  pal: {
    A: '#4a4a62', a: '#2a2a3e', h: '#6a6a82', Y: '#b4ff6a', k: '#06030a', T: '#7a6a3a', R: '#3a2050', r: '#22122e',
    W: '#9aa0b8', w: '#5a6078', t: '#7a6a3a', g: '#3a2a2a', G: '#4a4a62',
  },
  maps: { idle: hollowKnight(false), attack1: hollowKnight(true) },
  poses: { attack: ['attack1'] },
};

function lanternEater(up: boolean): string[] {
  const c = cc(18, 15);
  // wings (far, then near) with glowing eye-spots
  if (up) {
    c.blob(12, 3.5, 5, 3.5, 'mnn');
    c.blob(11, 6, 6, 4.2, 'MMmn').radial(12, 5, 2.2, 2, 'EEe').plot(12, 5, 'k');
  } else {
    c.blob(12, 11, 5, 3.2, 'mnn');
    c.blob(11, 9, 6, 4, 'MMmn').radial(12, 10, 2.2, 1.8, 'EEe').plot(12, 10, 'k');
  }
  // body: a gaping maw
  c.blob(5, 8, 4.5, 4, 'MMmn');
  c.radial(4, 8, 2.8, 2.6, 'oxkk');
  c.plot(3, 5, 'W').plot(5, 5, 'W').plot(2, 7, 'W').plot(3, 11, 'W').plot(5, 11, 'W');
  // antennae + legs
  c.line(5, 4, 2, 0, 'a').line(7, 4, 7, 0, 'a').plot(1, 0, 'a').plot(8, 0, 'a');
  c.line(6, 12, 5, 14, 'n').line(8, 12, 8, 14, 'n');
  return c.out();
}

const LANTERN_EATER: UnitArt = {
  face: 'L',
  out: '#06030a',
  glow: 'Eeox',
  dead: 'slump',
  pal: {
    M: '#6a4a86', m: '#46305e', n: '#281a38', E: '#d8ff7a', e: '#7ad83a', k: '#06030a', W: '#e8f0d0', a: '#9a8aaa',
    o: '#ffe08a', x: '#c8902a',
  },
  maps: { idle: lanternEater(true), idle2: lanternEater(false) },
};

// ─────────────────────────────── The Ember Heart ───────────────────────────────

const ASHEN_ECHO_MAP = [
  '.......e..........',
  '......eGGc........',
  '.....GGGGGGc......',
  '....GGGGGGGgc.....',
  '...gOkkkGGGgcc....',
  '....GGGGGGgccc....',
  '....ggGGGggcccc...',
  '..gGGGGGGGGgcccc..',
  '.gGGGGGeGGGGgccc..',
  '.gGgGGGGeGGggcccc.',
  '..SgGGGGGeGg.ccccc',
  '.SS.gGGGGGeg..cccc',
  'tTt.gLLLLLLg...ccc',
  '.W..gGGGgGGg....cc',
  '.W..gGGg.gGGg....c',
  '.W..qGg...gGq.....',
  '....qqg...qqq.....',
  '.....q.....q......',
  '....q.......q.....',
];

const ASHEN_ECHO: UnitArt = {
  face: 'L',
  out: '#2a1410',
  dead: 'slump',
  glow: 'Oe',
  pal: {
    G: '#c8b8b0e0', g: '#8a7a78d8', c: '#5a4648c8', k: '#2a1410', O: '#ffb040', e: '#ff7a2a', W: '#e8d8c8', t: '#8a6a4a',
    T: '#c8a070', S: '#a89890e0', L: '#6a4a3a', q: '#8a7a7880',
  },
  maps: {
    idle: ASHEN_ECHO_MAP,
    attack1: cc(ASHEN_ECHO_MAP).erase(0, 10, 3, 15).grow(5, 0, 0, 0).line(0, 10, 6, 10, 'W').stamp(['T', 'T', 't'], 7, 9).stamp(['SS', 'S.'], 8, 9).out(),
  },
  poses: { attack: ['attack1'] },
};

function flameConstruct(attack: boolean): string[] {
  const c = cc(32, 34);
  // legs
  c.rect(10, 26, 5, 7, 'i').rect(19, 26, 5, 7, 'i').rect(10, 26, 3, 6, 'I').rect(19, 26, 3, 6, 'I');
  c.rect(9, 32, 7, 2, 'j').rect(18, 32, 7, 2, 'j');
  // body
  c.blob(17, 17, 11, 10, 'IIiij');
  // furnace grate
  c.rect(12, 14, 9, 7, 'k').stamp(['YOYOYOY', 'OYOyOYO', 'yOYOYOy', 'OyOYOyO', 'oyOyOyo'], 13, 15).stamp(['iiiiiiiii'], 12, 13).stamp(['iiiiiiiii'], 12, 21);
  // head + chimney flames
  c.blob(17, 6, 5, 4, 'IIij').stamp(['YkkY'], 14, 6).stamp(['.o.F.o', 'oFoFFo', '.FYFF.'], 14, 0);
  // rivets
  c.plot(9, 14, 'W').plot(25, 14, 'W').plot(9, 20, 'W').plot(25, 20, 'W');
  // arms + molten fists
  if (!attack) {
    c.blob(6, 18, 3.5, 6, 'IIij').blob(5, 25, 3.5, 3, 'FFfm');
  } else {
    c.blob(6, 14, 3.5, 5, 'IIij').blob(3, 10, 3.5, 3, 'FFfm').plot(1, 7, 'o').plot(4, 6, 'o');
  }
  c.blob(28, 18, 3, 6, 'Iij').blob(29, 24, 3, 2.6, 'Ffm');
  return c.out();
}

const FLAME_CONSTRUCT: UnitArt = {
  face: 'L',
  out: '#120808',
  breath: 24,
  glow: 'YOoy',
  pal: {
    I: '#7a6a6a', i: '#4e4246', j: '#2c2428', k: '#1a0e0e', Y: '#fff2b0', O: '#ffb040', y: '#ff7a2a', o: '#ffcf6a',
    F: '#ffb040', f: '#e05a1e', m: '#8a2a10', W: '#c8b8a8',
  },
  maps: { idle: flameConstruct(false), attack1: flameConstruct(true) },
  poses: { attack: ['attack1'] },
};

function phoenix(up: boolean): string[] {
  const c = cc(27, 21);
  // tail plumes
  c.sweep([15, 11], [21, 12], [26, 17], 2, 0.6, 'Ffr');
  c.sweep([15, 12], [19, 16], [21, 20], 1.6, 0.5, 'Ffr');
  c.sweep([14, 10], [20, 9], [26, 11], 1.4, 0.5, 'YFf');
  // far wing
  if (up) c.poly([[10, 8], [15, 8], [18, 1], [13, 2]], 'r');
  else c.poly([[10, 11], [15, 11], [18, 18], [12, 15]], 'r');
  // body + head
  c.blob(11, 10, 5.5, 3.6, 'YFFfr');
  c.blob(5, 7, 2.8, 2.6, 'YYFf');
  c.stamp(['WW', '.w'], 0, 7).plot(4, 6, 'k');
  c.stamp(['.o.o', 'oFoF', '.FF.'], 4, 2);
  // near wing with flame-feather tips
  if (up) {
    c.poly([[8, 9], [14, 9], [23, 0], [17, 1], [11, 4]], 'F');
    c.line(10, 8, 20, 1, 'f').line(12, 8, 22, 1, 'Y');
    c.plot(23, 0, 'o').plot(20, 0, 'o').plot(17, 0, 'o');
  } else {
    c.poly([[8, 10], [14, 10], [22, 18], [16, 17], [10, 13]], 'F');
    c.line(10, 11, 19, 17, 'f').line(12, 10, 21, 17, 'Y');
    c.plot(22, 19, 'o').plot(19, 19, 'o').plot(16, 18, 'o');
  }
  return c.out();
}

const CINDER_PHOENIX: UnitArt = {
  face: 'L',
  out: '#2a0a04',
  glow: 'oY',
  dead: 'slump',
  pal: { r: '#c83a14', F: '#ffb040', f: '#ff7a2a', Y: '#fff2b0', o: '#ffd27a', k: '#2a0a04', W: '#ffe07a', w: '#c88a2a' },
  maps: { idle: phoenix(true), idle2: phoenix(false) },
};

const EMBER_ACOLYTE_MAP = [
  '.......rrr........',
  '......rRRRr.......',
  '.....rRRRRRr......',
  '....rRMMMRRr......',
  '....rMkMMMRr......',
  '....rMMmMMRr......',
  '.....rMMMRRr......',
  '....rRRRRRRRr.....',
  '...rRRMMMMRRRr....',
  '..SS.RRRMRRRrr....',
  '.S...RRRMRRRRr....',
  '.S...RRRMRRRrr....',
  '.S..rRRRMRRRRrr...',
  '.n..rRRRMRRRRrr...',
  'nNn.rRRMMMRRRRrr..',
  'NYN.rRRRMRRRRRrr..',
  'nNn.rRRRMRRRRRrrr.',
  '.n.rRRRRMRRRRRrrr.',
  '...rRRRRMRRRRRRrrr',
  '...rrrrrrrrrrrrrr.',
];

const EMBER_ACOLYTE: UnitArt = {
  face: 'L',
  out: '#1a0806',
  breath: 9,
  glow: 'YZz',
  pal: {
    R: '#a8342a', r: '#6a1a18', M: '#ffd36a', m: '#c88a2a', k: '#2a1006', S: '#d8b8a0', n: '#8a6a3a', N: '#c8a050',
    Y: '#ffcf6a', Z: '#fff2b0', z: '#ff9a3a',
  },
  maps: {
    idle: EMBER_ACOLYTE_MAP,
    idle2: cc(EMBER_ACOLYTE_MAP).stamp(['.z', 'z.'], 0, 11).out(),
    cast: cc(EMBER_ACOLYTE_MAP).grow(0, 4, 0, 0).erase(0, 13, 4, 20).stamp(['.Z.z', 'z.Z.', '.nNn', '.NYN', '.nNn', '.S..', 'SS..', 'S...'], 0, 6).out(),
  },
  poses: { attack: ['cast'], cast: ['cast'] },
};

export const DEEP_ENEMY_ART: Record<string, UnitArt> = {
  shardback: SHARDBACK,
  gem_bat: GEM_BAT,
  crystal_mite: CRYSTAL_MITE,
  geomancer: GEOMANCER,
  frost_revenant: FROST_REVENANT,
  rime_archer: RIME_ARCHER,
  ice_wraith: ICE_WRAITH,
  frost_hound: FROST_HOUND,
  voidspawn: VOIDSPAWN,
  gloom_caster: GLOOM_CASTER,
  hollow_knight: HOLLOW_KNIGHT,
  lantern_eater: LANTERN_EATER,
  ashen_echo: ASHEN_ECHO,
  flame_construct: FLAME_CONSTRUCT,
  cinder_phoenix: CINDER_PHOENIX,
  ember_acolyte: EMBER_ACOLYTE,
};
