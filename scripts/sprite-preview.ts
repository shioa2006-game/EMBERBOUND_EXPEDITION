// Sprite / icon / scene contact sheets → docs/art/*.png (no dependencies: PNG encoder on node:zlib).
//
//   node scripts/sprite-preview.ts            all sheets
//   node scripts/sprite-preview.ts heroes     hero poses × tiers
//   node scripts/sprite-preview.ts enemies    every enemy sprite × poses
//   node scripts/sprite-preview.ts icons      every IconKey
//   node scripts/sprite-preview.ts lineup     every area's units side by side at true relative size
//   node scripts/sprite-preview.ts scenes     area backgrounds, camp, title (software-rasterised via SoftGfx)
//   node scripts/sprite-preview.ts battle     battle mock-ups: backdrop + party + a wave / the boss
//   node scripts/sprite-preview.ts unit <key[,key...]> [scale]   units, all poses (and tiers for heroes)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { blit, makePix, parseColor, scaleInt, setPx, type Pix } from '../src/render/sprites/pix.ts';
import { unitFrame, unitFrameCount, unitKeys, type Pose } from '../src/render/sprites/units.ts';
import { allIconKeys, iconPix } from '../src/render/sprites/icons.ts';
import { SoftGfx } from '../src/render/sprites/gfx.ts';
import { paintArea, paintAreaForeground, paintCamp, paintTitle } from '../src/render/sprites/scenes.ts';
import { ENEMIES } from '../src/data/enemies.ts';
import { AREA_ORDER, HERO_ORDER, type SaveData } from '../src/core/types.ts';
import { AREAS } from '../src/data/areas.ts';
import { HERO_POS } from '../src/core/battle.ts';

const OUT = 'docs/art';

// ---------------------------------------------------------------------------
// PNG encoder
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(p: Pix): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(p.w, 0);
  ihdr.writeUInt32BE(p.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((p.w * 4 + 1) * p.h);
  for (let y = 0; y < p.h; y++) {
    raw[y * (p.w * 4 + 1)] = 0;
    Buffer.from(p.d.buffer, p.d.byteOffset + y * p.w * 4, p.w * 4).copy(raw, y * (p.w * 4 + 1) + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

function save(name: string, p: Pix): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.png`, encodePNG(p));
  console.log(`wrote ${OUT}/${name}.png (${p.w}x${p.h})`);
}

// ---------------------------------------------------------------------------
// Tiny 3x5 label font
// ---------------------------------------------------------------------------

const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', _: '000000000000111', '-': '000000111000000', ':': '000010000010000', '.': '000000000000010',
  ' ': '000000000000000',
};

function text(dst: Pix, x: number, y: number, s: string, color = '#e8dcc8'): void {
  const c = parseColor(color);
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') setPx(dst, cx + (i % 3), y + ((i / 3) | 0), c);
    cx += 4;
  }
}

function fill(p: Pix, color: string): void {
  const c = parseColor(color);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) setPx(p, x, y, c);
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const POSES: Pose[] = ['idle', 'walk', 'attack', 'cast', 'hurt', 'dead'];

interface Cell {
  pix: Pix;
  ax: number;
  ay: number;
  label: string;
}

/** Lay out rows of cells; each cell drawn with its anchor on a common baseline. */
function sheet(rows: { label: string; cells: Cell[] }[], scale: number, bg = '#3b3346'): Pix {
  const cellW = Math.max(...rows.flatMap((r) => r.cells.map((c) => c.pix.w))) + 4;
  let maxUp = 0;
  let maxDown = 0;
  for (const r of rows) for (const c of r.cells) {
    maxUp = Math.max(maxUp, c.ay);
    maxDown = Math.max(maxDown, c.pix.h - c.ay);
  }
  const labelW = 64;
  const cellH = maxUp + maxDown + 8;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const img = makePix(labelW + cols * cellW, rows.length * cellH);
  fill(img, bg);
  const ground = parseColor('#5a4e66');
  rows.forEach((r, ri) => {
    text(img, 2, ri * cellH + 2, r.label);
    r.cells.forEach((c, ci) => {
      const bx = labelW + ci * cellW;
      const by = ri * cellH + 6 + maxUp;
      for (let x = bx; x < bx + cellW - 2; x++) setPx(img, x, by, ground);
      blit(img, c.pix, bx + Math.floor(cellW / 2) - c.ax, by - c.ay);
      text(img, bx + 1, ri * cellH + 1, c.label, '#8a7f96');
    });
  });
  return scaleInt(img, scale);
}

function unitRow(key: string, tier: number, label: string): { label: string; cells: Cell[] } {
  const cells: Cell[] = [];
  for (const pose of POSES) {
    const n = unitFrameCount(key, pose);
    for (let f = 0; f < n; f++) {
      const fr = unitFrame(key, pose, f, tier);
      cells.push({ ...fr, label: `${pose.slice(0, 3)}${n > 1 ? f + 1 : ''}` });
    }
  }
  return { label, cells };
}

function heroesSheet(): void {
  for (const h of HERO_ORDER) {
    const rows = [0, 1, 2, 3, 4, 5].map((t) => unitRow(h, t, `${h.slice(0, 4)} T${t}`));
    save(`hero_${h}`, sheet(rows, 3));
  }
  // lineup: idle frame of every hero per tier, at 4x
  const rows = [0, 1, 2, 3, 4, 5].map((t) => ({
    label: `TIER ${t}`,
    cells: HERO_ORDER.map((h) => ({ ...unitFrame(h, 'idle', 0, t), label: h.slice(0, 4) })),
  }));
  save('heroes_tiers', sheet(rows, 4));
}

function enemySprites(): string[] {
  const seen = new Set<string>();
  for (const e of Object.values(ENEMIES)) seen.add(e.sprite);
  return [...seen];
}

function enemiesSheet(): void {
  const keys = enemySprites();
  const groups: Record<string, string[]> = { normal: [], elite: [], boss: [] };
  for (const k of keys) {
    const def = Object.values(ENEMIES).find((e) => e.sprite === k)!;
    const g = def.rank === 'boss' && def.size === 'huge' ? 'boss' : def.rank === 'normal' ? 'normal' : 'elite';
    groups[g].push(k);
  }
  save('enemies_normal', sheet(groups.normal.map((k) => unitRow(k, 0, k.slice(0, 15))), 3));
  save('enemies_elite', sheet(groups.elite.map((k) => unitRow(k, 0, k.slice(0, 15))), 3));
  save('enemies_boss', sheet(groups.boss.map((k) => unitRow(k, 0, k.slice(0, 15))), 2));
  const missing = keys.filter((k) => !unitKeys().includes(k));
  if (missing.length) console.log('MISSING ART:', missing.join(', '));
}

function iconsSheet(): void {
  const keys = allIconKeys();
  const per = 10;
  const sc = 4;
  const cell = 16 * sc + 8;
  const img = makePix(per * cell, Math.ceil(keys.length / per) * (cell + 8));
  fill(img, '#241b2c');
  keys.forEach((k, i) => {
    const x = (i % per) * cell;
    const y = Math.floor(i / per) * (cell + 8);
    blit(img, scaleInt(iconPix(k), sc), x + 4, y + 4);
    text(img, x + 2, y + cell, k.replace(/^(skill_|status_|relic_|hero_)/, '').slice(0, 15), '#8a7f96');
  });
  save('icons', img);
  // 1x strip as seen in UI
  const strip = makePix(keys.length * 18, 18);
  fill(strip, '#1d1526');
  keys.forEach((k, i) => blit(strip, iconPix(k), i * 18 + 1, 1));
  save('icons_1x', scaleInt(strip, 2));
}

function fakeSave(area: SaveData['selectedArea'], heroes: number, level: number): SaveData {
  const hs = {} as SaveData['heroes'];
  HERO_ORDER.forEach((h, i) => (hs[h] = { recruited: i < heroes, level }));
  return { heroes: hs, selectedArea: area } as unknown as SaveData;
}

function scenesSheet(): void {
  for (const id of AREA_ORDER) {
    const g = new SoftGfx(400, 180);
    paintArea(g, id, 37, 2.3);
    paintAreaForeground(g, id, 37, 2.3);
    save(`bg_${id}`, scaleInt(g.pix, 2));
  }
  const camp = new SoftGfx(400, 180);
  paintCamp(camp, fakeSave('ashwood', 4, 30), 1.7);
  save('camp', scaleInt(camp.pix, 2));
  const camp2 = new SoftGfx(400, 180);
  paintCamp(camp2, fakeSave('rimeholt', 2, 80), 0.4);
  save('camp_2', scaleInt(camp2.pix, 2));
  const title = new SoftGfx(400, 180);
  paintTitle(title, 3.1);
  save('title', scaleInt(title.pix, 2));
}

/** Battle mock-ups: backdrop + party + one wave (top) and the boss fight (bottom) for every area. */
function battleSheet(): void {
  const ENEMY_POS = [
    { x: 236, y: 150 }, { x: 266, y: 144 }, { x: 296, y: 153 }, { x: 324, y: 146 }, { x: 352, y: 152 }, { x: 378, y: 145 },
  ];
  const BOSS_POS = { x: 318, y: 152 };
  for (const id of AREA_ORDER) {
    const area = AREAS[id];
    const img = makePix(400, 360);
    const tier = Math.min(5, area.index);
    const frames: [string[], number][] = [
      [area.stages[Math.min(8, 6)].variants[0], 0],
      [area.stages[9].variants[0], 180],
    ];
    frames.forEach(([wave, oy], fi) => {
      const g = new SoftGfx(400, 180);
      paintArea(g, id, 40 + fi * 90, 1.3 + fi);
      HERO_ORDER.forEach((h, i) => {
        if (i > area.index) return;
        const f = unitFrame(h, i === 0 && fi === 1 ? 'attack' : 'idle', fi, tier);
        g.image(f.pix, HERO_POS[i].x - f.ax, HERO_POS[i].y - f.ay);
      });
      wave.forEach((eid, i) => {
        const def = ENEMIES[eid];
        const pos = wave.length === 1 ? BOSS_POS : def.rank === 'boss' ? ENEMY_POS[i] : ENEMY_POS[i];
        const f = unitFrame(def.sprite, 'idle', i, 0);
        g.image(f.pix, pos.x - f.ax, pos.y - (def.flying ? 18 : 0) - f.ay);
      });
      paintAreaForeground(g, id, 40, 1.3);
      blit(img, g.pix, 0, oy);
    });
    save(`battle_${id}`, scaleInt(img, 2));
  }
}

/** Line-ups: every unit of each area standing on one baseline at true relative size (3x). */
function lineupSheet(): void {
  const rows = AREA_ORDER.map((id) => {
    const keys = new Set<string>();
    for (const st of AREAS[id].stages) for (const v of st.variants) for (const e of v) keys.add(ENEMIES[e].sprite);
    for (const e of Object.values(ENEMIES)) if (e.abilities?.some((a) => a.effect.kind === 'summon') && keys.has(e.sprite)) {
      for (const a of e.abilities) if (a.effect.kind === 'summon') keys.add(ENEMIES[a.effect.enemy].sprite);
    }
    return { label: id, cells: [...keys].map((k) => ({ ...unitFrame(k, 'idle', 0, 0), label: '' })) };
  });
  save('lineup', sheet(rows, 3, '#2a2236'));
}

const [what = 'all', arg1, arg2] = process.argv.slice(2);
if (what === 'unit' && arg1) {
  const keys = arg1.split(',');
  const rows = keys.flatMap((k) => {
    const isHero = (HERO_ORDER as readonly string[]).includes(k);
    return (isHero ? [0, 1, 2, 3, 4, 5] : [0]).map((t) => unitRow(k, t, isHero ? `${k.slice(0, 8)} T${t}` : k.slice(0, 15)));
  });
  save(keys.length > 1 ? 'unit_list' : `unit_${arg1}`, sheet(rows, Number(arg2 ?? 5)));
} else {
  const all = what === 'all';
  if (all || what === 'heroes') heroesSheet();
  if (all || what === 'enemies') enemiesSheet();
  if (all || what === 'lineup') lineupSheet();
  if (all || what === 'icons') iconsSheet();
  if (all || what === 'scenes') scenesSheet();
  if (all || what === 'battle') battleSheet();
}
