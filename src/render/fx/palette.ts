// Effect colour palette (mirrors src/styles/tokens.css so canvas and DOM agree).

export const COL = {
  ink: '#120a10',
  inkSoft: '#2a1a26',
  white: '#ffffff',
  cream: '#f3e9dc',
  grey: '#9a94a4',

  orange: '#ffa630', // interruptible
  orangeHi: '#ffd08a',
  orangeBg: '#3a2410',
  purple: '#b76bff', // unstoppable
  purpleHi: '#e3c2ff',
  purpleBg: '#24123a',

  ember: '#ff8a3d',
  emberHi: '#ffb35a',
  fire: '#ffd25a',
  fireDeep: '#e2461e',
  smoke: '#4a3a44',

  gold: '#ffd84a',
  goldHi: '#fff3a0',
  goldDeep: '#c8901c',

  hp: '#e04848',
  hpHi: '#ff7a6a',
  hpBg: '#3a1420',
  heroHp: '#5fd068',
  heroHpHi: '#a8f0a0',
  heroHpMid: '#ffcf4a',
  heroHpLow: '#ff5a5a',

  barrier: '#fff1b8',
  barrierHi: '#ffffff',
  ward: '#7fe0e8',
  wardHi: '#d0fbff',
  wardDeep: '#2a8a9a',
  heal: '#7dff8a',
  healDeep: '#2fb04a',
  shard: '#6fe3ff',
  ice: '#bfe8ff',
  iceDeep: '#5aa8e0',
  doom: '#d070ff',
  doomDeep: '#3a0a4a',
  venom: '#9be05a',
  lanternGreen: '#b4ff6a',
  bad: '#ff5a5a',
  armor: '#a8b8cc',

  guardian: '#5aa0ff',
  ranger: '#5fd068',
  arcanist: '#c070ff',
  oracle: '#ffd95a',
} as const;

export const HERO_COLOR: Record<string, string> = {
  guardian: COL.guardian,
  ranger: COL.ranger,
  arcanist: COL.arcanist,
  oracle: COL.oracle,
};

export const NUM_FONT = 'Georgia, "Times New Roman", serif';
export const JP_FONT = '"Yu Mincho", "Hiragino Mincho ProN", Georgia, serif';
