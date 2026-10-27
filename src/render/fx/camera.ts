// Screen shake (trauma model), screen flashes, fades and the hit-stop / slow-motion clock.
// Everything here runs on REAL time so slow-mo never stretches a shake or a freeze.
import { clamp01 } from './util.ts';

export class Camera {
  enabled = true; // settings.screenShake
  /** Integer world-pixel offset applied to the world this frame. */
  sx = 0;
  sy = 0;
  private trauma = 0;
  private dirX = 0; // directional kick (decays)
  private dirY = 0;

  // flashes
  flashColor = '#ffffff';
  flashAlpha = 0;
  private flashDecay = 4;

  // fade to black (descent transition)
  fade = 0;
  private fadeDecay = 1;

  // time control
  private hitStop = 0;
  private slowT = 0;
  private slowScale = 1;

  reset(): void {
    this.trauma = 0;
    this.sx = this.sy = 0;
    this.dirX = this.dirY = 0;
    this.flashAlpha = 0;
    this.fade = 0;
    this.hitStop = 0;
    this.slowT = 0;
    this.slowScale = 1;
  }

  /** Add shake. amount ≈ max pixel amplitude (1 = subtle, 3 = heavy, 5 = huge). */
  shake(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(6, Math.max(this.trauma, amount));
  }

  /** Directional jolt (e.g. heavy slash pushes the screen sideways). */
  kick(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.dirX += dx;
    this.dirY += dy;
  }

  flash(color: string, alpha: number, duration = 0.25): void {
    if (alpha >= this.flashAlpha || color === this.flashColor) {
      this.flashColor = color;
      this.flashAlpha = Math.max(this.flashAlpha, clamp01(alpha));
      this.flashDecay = this.flashAlpha / Math.max(0.05, duration);
    }
  }

  fadeOut(duration: number): void {
    this.fade = 1;
    this.fadeDecay = 1 / Math.max(0.1, duration);
  }

  freeze(seconds: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  slowmo(seconds: number, scale: number): void {
    this.slowT = Math.max(this.slowT, seconds);
    this.slowScale = scale;
  }

  timeScale(): number {
    if (this.hitStop > 0) return 0.04;
    if (this.slowT > 0) {
      // ease back to normal over the last 0.3 s
      const ease = this.slowT < 0.3 ? this.slowT / 0.3 : 1;
      return this.slowScale + (1 - this.slowScale) * (1 - ease);
    }
    return 1;
  }

  update(dt: number): void {
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - this.flashDecay * dt);
    if (this.fade > 0) this.fade = Math.max(0, this.fade - this.fadeDecay * dt);
    if (!this.enabled) {
      this.trauma = 0;
      this.dirX = this.dirY = 0;
      this.sx = this.sy = 0;
      return;
    }
    this.trauma = Math.max(0, this.trauma - dt * (3 + this.trauma * 2.2));
    const k = Math.exp(-dt * 18);
    this.dirX *= k;
    this.dirY *= k;
    const a = this.trauma;
    if (a > 0.15) {
      this.sx = Math.round((Math.random() * 2 - 1) * a + this.dirX);
      this.sy = Math.round((Math.random() * 2 - 1) * a * 0.7 + this.dirY);
    } else {
      this.sx = Math.round(this.dirX);
      this.sy = Math.round(this.dirY);
    }
  }
}
