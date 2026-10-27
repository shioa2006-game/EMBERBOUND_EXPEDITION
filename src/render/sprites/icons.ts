// DOM-free icon baking: 16x16 pixel icons for every IconKey (+ relic icons from data/relics.ts).
import { blit, makePix, outline, paintMap, mapSize, type Pix } from './pix.ts';
import { ICON_ART, RELIC_FALLBACK, type IconArt } from './data/icons.ts';
import { unitArt, unitFrame } from './units.ts';
import { RELIC_LIST } from '../../data/relics.ts';

const HERO_ICON_CROP: Record<string, { x: number; y: number }> = {
  guardian: { x: 4, y: 0 },
  ranger: { x: 2, y: 1 },
  arcanist: { x: 0, y: 4 },
  oracle: { x: 1, y: 1 },
};

const cache = new Map<string, Pix>();

function bakeIcon(art: IconArt): Pix {
  const sz = mapSize(art.rows);
  const ox = Math.floor((14 - sz.w) / 2);
  const oy = Math.floor((14 - sz.h) / 2);
  const body = makePix(14, 14);
  paintMap(body, art.rows, art.pal, ox, oy, art.glow);
  const out = outline(body, art.out ?? '#140c14');
  if (art.glow) {
    const light = makePix(14, 14);
    paintMap(light, art.rows, art.pal, ox, oy, undefined, art.glow);
    blit(out, light, 1, 1);
  }
  return out;
}

/** Hero portrait: the head & shoulders of the gear-tier-0 idle sprite. */
function heroIcon(hero: string): Pix {
  const f = unitFrame(hero, 'idle', 0, 0);
  const art = unitArt(hero);
  const idle = art?.maps.idle;
  const idleH = Array.isArray(idle) ? idle.length : 24;
  const crop = HERO_ICON_CROP[hero] ?? { x: 0, y: 0 };
  // idle map (x, y) → frame pixel (ax - art.ax + x, ay - idleH + y); keep 1px for the outline
  const sx = f.ax - (art?.ax ?? 0) + crop.x - 1;
  const sy = f.ay - idleH + crop.y - 1;
  const p = makePix(16, 16);
  blit(p, f.pix, -sx, -sy);
  return p;
}

export function iconPix(key: string): Pix {
  let p = cache.get(key);
  if (p) return p;
  if (key.startsWith('hero_')) p = heroIcon(key.slice(5));
  else {
    const art = ICON_ART[key] ?? RELIC_FALLBACK;
    p = bakeIcon(art);
  }
  cache.set(key, p);
  return p;
}

/** Every icon key the game uses (fixed keys + one per relic). */
export function allIconKeys(): string[] {
  const fixed = [
    'gold', 'ember', 'shard', 'lantern', 'star', 'skull', 'crown', 'lock', 'sword', 'heart', 'clock',
    'skill_shieldBash', 'skill_arrowRain', 'skill_meteor', 'skill_sanctuary', 'overdrive',
    'hero_guardian', 'hero_ranger', 'hero_arcanist', 'hero_oracle',
    'status_burn', 'status_mark', 'status_stun', 'status_doom', 'status_frozen', 'status_ward', 'status_barrier',
  ];
  const relics = RELIC_LIST.map((r) => r.icon);
  return [...fixed, ...relics.filter((k) => !fixed.includes(k))];
}
