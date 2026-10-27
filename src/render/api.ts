// Contract between the app shell (src/main.ts, src/ui) and the renderer (src/render).
// The renderer owns ALL canvas drawing: battle scene, camp scene, title backdrop,
// in-world effects (damage numbers, floating texts, windup bars, HP bars, banners, particles,
// projectiles, screen shake, loot fountains) and a full-window overlay for loot flying to the HUD.
import type { Battle } from '../core/battle.ts';
import type { BattleEvent, SaveData } from '../core/types.ts';

export interface RenderSettings {
  screenShake: boolean;
  damageNumbers: boolean;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** DOM targets loot should fly to (client rects). Provided by the UI. */
export interface LootTargets {
  gold?: () => DOMRect | null;
  ember?: () => DOMRect | null;
  shard?: () => DOMRect | null;
}

export interface IRenderer {
  /** Create canvases inside `container` (the battle viewport element). Called once. */
  mount(container: HTMLElement): void;
  /** Recompute integer pixel scale after the container size changes. */
  resize(): void;
  setSettings(s: RenderSettings): void;
  setLootTargets(t: LootTargets): void;
  /** Called when a new Battle starts (reset per-run visual state). */
  beginBattle(battle: Battle): void;
  /** Feed the events produced by the simulation this frame (call before renderBattle). */
  pushEvents(events: BattleEvent[], battle: Battle): void;
  /**
   * Draw the battle. `dt` = real seconds since last frame (visual effects keep animating during slow-mo).
   * `simLead` = sim seconds accumulated but not yet ticked (the fixed-step accumulator); sim-time
   * visuals advance to `battle.time + simLead` so they stay smooth at refresh rates above 60 Hz.
   */
  renderBattle(battle: Battle, dt: number, simLead?: number): void;
  /** Draw the camp scene (party resting at a campfire, backdrop of the selected area). */
  renderCamp(save: SaveData, dt: number): void;
  /** Draw the title-screen backdrop. */
  renderTitle(dt: number): void;
  /** Convert client coords (mouse) to battle world coords (400 x 180). Null if outside the viewport. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Client-space rect of a unit, for anchoring DOM hints. */
  unitClientRect(battle: Battle, unitId: number): ScreenRect | null;
  /** Hit-stop / slow motion requested by visual events (interrupt 80ms, boss kill slow-mo ...). 1 = normal. */
  timeScale(): number;
  /** CSS px per world px of the battle canvas (0 if not mounted). */
  worldScale(): number;
}
