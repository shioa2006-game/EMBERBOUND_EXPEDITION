/**
 * EMBERBOUND EXPEDITION — parts shared by every `eb-*` character (plan/EMBERBOUND_PRODUCTION.md).
 *
 *   - Game timing: the game shows an attack / cast pose for 0.2 s and a hurt pose for 0.14 s, holds the
 *     dead pose, and applies hits 0.12–0.3 s after an action starts. Characters use these periods and
 *     put the impact (or the release of a projectile) where the game expects it.
 *   - Hurt and dead: the whole figure tilts back about a point behind the heels (a small recoil, or a fall
 *     onto the back). A fallen character slides forward so it lies about where it stood. A forward lean
 *     (negative tilt) turns about the toes instead.
 *
 * Use: `const tilt = fallTilt(action, t)` before drawing, then `withTilt(ctx, x, y, scale, rf.sx, tilt,
 * action === 'dead', () => renderRig(...))`. Character-specific leans (a Shield Bash lunge, an upward
 * shot) are added to the returned tilt by the character.
 */
import { keyframes } from '../../../src/authoring.js';

/** Periods (seconds) of the game actions. */
export const GAME_T = Object.freeze({ attack: .3, cast: .3, hurt: .3, dead: .6 });

/** Cached-frame keys for hurt and dead (the impact of hurt is at u = .15, 0.045 s). */
export const HURT_KEYS = Object.freeze([0, .15, .3, .6]);
export const DEAD_KEYS = Object.freeze([0, .15, .3, .45, .6, .75, .99]);

/** Action specs for hurt and dead; `dead` holds its last frame in the game. */
export const hurtAction = Object.freeze({ period: GAME_T.hurt, keys: HURT_KEYS, once: true });
export const deadAction = Object.freeze({ period: GAME_T.dead, keys: DEAD_KEYS, once: true, hold: true });

/** Position 0–1 within a period. */
export const phase = (t, period) => ((t % period) + period) % period / period;
/** One value from keyframes [[u, [v]], …]. */
export const sample = (keys, u) => keyframes(keys, u)[0];

/** How far into the recoil (0–1): snaps back in 0.045 s, holds, then eases a little. */
export const hurtAmount = t => sample([[0, [0]], [.15, [1]], [.6, [1]], [1, [.4]]], phase(t, GAME_T.hurt));
/** How far into the fall (0–1 of the dead period). */
export const deadPhase = t => phase(t, GAME_T.dead);

/** Whole-body tilt (radians, + = backward) for hurt and dead: a stagger, a fall that overshoots a little, then rest. */
export function fallTilt(action, t) {
  if (action === 'hurt') return .14 * hurtAmount(t);
  if (action === 'dead') return Math.PI / 2 * sample([[0, [0]], [.15, [.08]], [.62, [1.04]], [.72, [.97]], [.82, [1]], [1, [1]]], deadPhase(t));
  return 0;
}

/** Pivot and slide of the tilt (local px). */
export const FALL = Object.freeze({ pivot: 20, toe: 8, shift: 66 });

/**
 * Draw with the whole figure tilted. Backward tilt turns about a point `fall.pivot` behind the heels (so the
 * back stays above the floor); forward tilt turns about the toes. When `slide` is set (dead), the figure also
 * slides forward by up to `fall.shift` so a fallen character lies about where it stood.
 */
export function withTilt(ctx, x, y, scale, sx, tilt, slide, draw, fall = FALL) {
  if (!tilt) return draw();
  const px = x - sx * (tilt > 0 ? fall.pivot : -fall.toe) * scale;
  const shift = slide ? sx * fall.shift * scale * Math.min(1, tilt / (Math.PI / 2)) : 0;
  ctx.save(); ctx.translate(px + shift, y); ctx.rotate(-sx * tilt); ctx.translate(-px, -y);
  try { return draw(); } finally { ctx.restore(); }
}
