// Contract between the app shell (src/main.ts + src/ui/*.ts, owned by "ui-core")
// and the camp screens (src/ui/camp/**, owned by "ui-camp").
import type { IAudio } from '../audio/api.ts';
import type { AreaId, SaveData } from '../core/types.ts';
import type { Notice } from '../core/state.ts';

export type CampTab = 'expedition' | 'party' | 'tree' | 'relics';

export interface CampContext {
  /** Live save object (mutate through core/state.ts actions, then call commit()). */
  getSave(): SaveData;
  /** Persist the save and refresh shared HUD (currency header). Call after every purchase. */
  commit(): void;
  /** Leave camp and start a run in `area`. */
  startRun(area: AreaId): void;
  /** Rekindle (prestige) flow finished inside camp: app shell may show a cinematic. */
  onRekindled(shardsGained: number): void;
  /** Show a toast message (Japanese). */
  toast(text: string, kind?: 'info' | 'good' | 'warn'): void;
  /** Tutorial flags (persisted in save.tutorial). Returns true the first time a key is seen. */
  firstTime(key: string): boolean;
  audio: IAudio;
}

export interface ICampView {
  /** Build DOM inside `root` (the camp panel element). */
  mount(root: HTMLElement, ctx: CampContext): void;
  /** Show camp, optionally on a tab; `notices` from the last run can highlight new things. */
  show(tab?: CampTab, notices?: Notice[]): void;
  hide(): void;
  /** Re-render after external save changes. */
  refresh(): void;
  /** Tabs currently unlocked (progressive reveal). */
  availableTabs(): CampTab[];
}
