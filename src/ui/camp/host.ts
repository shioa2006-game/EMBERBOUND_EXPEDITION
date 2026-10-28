// Shared plumbing between CampView and its tab pages.
import type { SfxName } from '../../audio/api.ts';
import { frontierArea, type Notice } from '../../core/state.ts';
import type { AreaId, HeroId, Mods, SaveData, TreeBranch, TreeNodeDef } from '../../core/types.ts';
import type { CampContext, CampTab } from '../contracts.ts';

export interface CampHost {
  readonly ctx: CampContext;
  save(): SaveData;
  /** computeMods(save), cached until the next commit/refresh. */
  mods(): Mods;
  /** ctx.commit() + re-sync the camp. Call after every save mutation. */
  commit(): void;
  sfx(name: SfxName, opts?: { volume?: number; pitch?: number }): void;
  /** One-time hint callout (ctx.firstTime). Inserted at the top of `slot`. Returns true when shown. */
  hint(slot: HTMLElement, key: string, title: string, text: string): boolean;
  /** Notices from the last run (for "NEW" highlights). */
  notices(): readonly Notice[];
  /** Drop run notices (e.g. after Rekindle resets the world). */
  clearNotices(): void;
  /** Open a modal inside the camp. Returns a close function. */
  openModal(panel: HTMLElement, onClose?: () => void): () => void;
  switchTab(tab: CampTab): void;
  /** Start a run to the selected area (the departure control is shared by every tab). */
  depart(): void;
  /** Layer for floating texts / bursts that may overflow cards. */
  fxLayer(): HTMLElement;
}

export interface TabView {
  readonly el: HTMLElement;
  /** Re-sync the DOM with the save. */
  update(): void;
  onShow(): void;
  onHide(): void;
  /** Keyboard handling while this tab is active. Return true when handled. */
  onKey(e: KeyboardEvent): boolean;
  /** Something actionable is waiting on this tab (badge dot). */
  hasAction(): boolean;
}

export const HERO_COLOR: Record<HeroId, string> = {
  guardian: '#5aa0ff',
  ranger: '#5fd068',
  arcanist: '#c070ff',
  oracle: '#ffd95a',
};

export const BRANCH_COLOR: Record<TreeBranch, string> = {
  core: '#ff8a3d',
  expedition: '#ffb35a',
  guardian: HERO_COLOR.guardian,
  ranger: HERO_COLOR.ranger,
  arcanist: HERO_COLOR.arcanist,
  oracle: HERO_COLOR.oracle,
  synergy: '#ff7ad9',
  rekindled: '#6fe3ff',
};

export const BRANCH_LABEL: Record<TreeBranch, string> = {
  core: 'Lantern Core',
  expedition: '遠征',
  guardian: 'Guardian',
  ranger: 'Ranger',
  arcanist: 'Arcanist',
  oracle: 'Oracle',
  synergy: 'シナジー',
  rekindled: 'Rekindled',
};

export const KIND_LABEL: Record<TreeNodeDef['kind'], string> = {
  stat: 'ステータス',
  ability: '新能力',
  behavior: '挙動変化',
  synergy: 'シナジー',
  keystone: 'キーストーン',
  root: '起点',
};

export const BUILD_COLOR: Record<string, string> = {
  BULWARK: '#5aa0ff',
  HUNT: '#5fd068',
  PYRE: '#ff8a3d',
  STORM: '#c070ff',
  RADIANCE: '#ffd95a',
  EMBERBOND: '#ff5a7a',
};

export const MILESTONE_TEXT = '全能力×1.5＋新装備';

/** Display colour of a node (pair synergies use the first class colour). */
export function nodeColor(n: TreeNodeDef): string {
  if (n.pair && n.pair.length === 2) return HERO_COLOR[n.pair[0]];
  if (n.id === 'emberbond') return '#ff5a7a';
  return BRANCH_COLOR[n.branch];
}

/** The area a departure goes to: the selection if it is open, else the frontier. */
export function departureArea(save: SaveData): AreaId {
  return save.areas[save.selectedArea]?.unlocked ? save.selectedArea : frontierArea(save);
}

export function noticeAreas(notices: readonly Notice[], kinds: Notice['kind'][]): Set<AreaId> {
  const out = new Set<AreaId>();
  for (const n of notices) {
    if (!kinds.includes(n.kind)) continue;
    if ('area' in n) out.add(n.area);
  }
  return out;
}
