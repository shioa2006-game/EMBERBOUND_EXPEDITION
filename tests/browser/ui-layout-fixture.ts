// Real UI components, in-memory saves only. Never reads or writes player storage.
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/hud.css';
import '../../src/styles/screens.css';
import '../../src/styles/camp.css';
import '../../src/styles/storybook.css';
import { CampView } from '../../src/ui/camp/index.ts';
import { TopBar } from '../../src/ui/header.ts';
import { Modals } from '../../src/ui/modal.ts';
import { showResult } from '../../src/ui/result.ts';
import { campSceneHeight } from '../../src/ui/layout.ts';
import { Renderer } from '../../src/render/renderer.ts';
import { AREA_ORDER, type RunResult } from '../../src/core/types.ts';
import { makeSave } from '../helpers/saves.ts';
import type { IAudio } from '../../src/audio/api.ts';
import type { CampTab } from '../../src/ui/contracts.ts';
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'early-expedition';
const late = scenario.startsWith('late');
const save = makeSave(late ? { heroes: 'all', level: 75, prestige: 1, unlocked: 'all', gold: 1234567, embers: 9876, shards: 456 } : { gold: 129, embers: 9, level: 7 });
save.stats.runs = late ? 90 : 3;
save.areas.ashwood.best = save.areas.ashwood.bestEver = 8;
save.areas.ashwood.attempts = 3;
if (late) { for (const id of AREA_ORDER) { save.areas[id].cleared = true; save.areas[id].best = 10; } save.selectedArea = 'heart'; }
const root = document.querySelector<HTMLElement>('#app')!;
root.style.setProperty('--camp-strip', `${campSceneHeight(innerHeight)}px`);
const audio: IAudio = { unlock() {}, setSettings() {}, play() {}, handleEvents() {}, setMusic() {} };
const firstTime = (key: string) => { if (save.tutorial[key]) return false; save.tutorial[key] = true; return true; };
const camp = new CampView();
const topbar = new TopBar({ getSave: () => save, runArea: () => null, liveLoot: () => null, livePlayTime: () => 0, soundOn: () => false, toggleSound() {}, openSettings() {} });
const viewportWrap = document.createElement('div'); viewportWrap.className = 'viewport-wrap';
const viewport = document.createElement('div'); viewport.className = 'viewport'; viewportWrap.append(viewport);
const campRoot = document.createElement('section'); campRoot.className = 'camp-root';
const modalRoot = document.createElement('div'); modalRoot.className = 'layer layer-modal';
root.append(topbar.el, viewportWrap, campRoot, modalRoot);
const modals = new Modals(modalRoot);
window.addEventListener('keydown', e => { if (modals.isOpen()) { modals.handleKey(e); e.stopImmediatePropagation(); } }, true);
let started = '';
camp.mount(campRoot, { getSave: () => save, audio, firstTime,
  commit: () => { topbar.update(); camp.refresh(); }, startRun: area => { started = area; },
  onRekindled() {}, toast() {},
});
const tab = (scenario.split('-')[1] ?? 'expedition') as CampTab;
camp.show(['party', 'tree', 'relics'].includes(tab) ? tab : 'expedition');
topbar.update();
const renderer = new Renderer(); renderer.mount(viewport);
function paint() { renderer.renderCamp(save, 1 / 60); requestAnimationFrame(paint); }
requestAnimationFrame(paint);
const result: RunResult = {
  areaId: 'ashwood', reason: 'wiped', stageReached: 8, stagesCleared: 7,
  segments: (late ? AREA_ORDER : ['ashwood'] as const).map(areaId => ({ areaId, stageReached: 8, stagesCleared: 7, bossDefeated: false, bossTime: 0, lanternFrac: .4 })),
  kills: 19, eliteKills: 1, bossDefeated: false, loot: { gold: 90, embers: 5, shards: late ? 100 : 0 },
  duration: 39.8, bestHit: 37, interrupts: 1, perfects: 1, routs: 2, emberNovas: late ? 3 : 0,
  killedBy: 'Heavy Swing (Ash Brute)', missed: { 'Gore Charge': 1, 'Heavy Swing': 1 },
};
if (scenario.includes('result')) {
  void showResult({ modals, audio, getSave: () => save, firstTime }, result,
    scenario.endsWith('plain') ? [] : [{ kind: 'newRecord', area: 'ashwood', stage: 8 }]);
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const failures: string[] = [];
const measurements: Record<string, unknown> = {};
const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
function visible(el: Element, name: string) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) failures.push(`${name} outside viewport: ${JSON.stringify(rect(el))}`);
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  if (!hit || !el.contains(hit)) failures.push(`${name} center obscured by ${hit?.className}`);
}
async function audit() {
  await delay(900); renderer.resize(); renderer.renderCamp(save, 0);
  measurements.viewport = [innerWidth, innerHeight];
  if (scenario.includes('result')) {
    const scroll = document.querySelector<HTMLElement>('.res-scroll')!;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.res-actions button')];
    const initial = buttons.map(rect); buttons.forEach(b => visible(b, b.textContent!));
    scroll.scrollTop = scroll.scrollHeight; await delay(60);
    buttons.forEach((b, i) => { visible(b, b.textContent!); if (Math.abs(b.getBoundingClientRect().y - initial[i].y) > 1) failures.push('Result action moved on scroll'); });
    const last = scroll.lastElementChild!;
    if (last.getBoundingClientRect().bottom > scroll.getBoundingClientRect().bottom + 1) failures.push('Result details cannot scroll fully into view');
    measurements.actions = initial; measurements.scrollHeight = scroll.scrollHeight;
    scroll.scrollTop = 0;
  } else if (scenario.endsWith('expedition')) {
    const button = document.querySelector<HTMLButtonElement>('.camp-depart')!;
    const initial = rect(button); visible(button, 'Departure');
    const scroll = document.querySelector<HTMLElement>('.camp-exp-scroll')!;
    scroll.scrollTop = scroll.scrollHeight; await delay(60); visible(button, 'Departure after scroll');
    if (Math.abs(button.getBoundingClientRect().y - initial.y) > 1) failures.push('Departure moved on scroll');
    const last = document.querySelector('.camp-exp-detail')!.lastElementChild!;
    if (last.getBoundingClientRect().bottom > scroll.getBoundingClientRect().bottom + 1) failures.push('Expedition details cannot scroll fully into view');
    const hint = document.querySelector<HTMLButtonElement>('.camp-hints button');
    if (hint) { hint.click(); await delay(320); if (Math.abs(button.getBoundingClientRect().y - initial.y) > 1) failures.push('Departure moved after dismissing hint'); }
    const guidance = document.querySelector('.camp-guidance')!;
    const guidanceBottom = guidance.getBoundingClientRect().bottom;
    if (guidanceBottom > scroll.getBoundingClientRect().top + 1) failures.push('Guidance overlaps details');
    document.querySelector<HTMLButtonElement>('[data-tab="party"]')!.click(); await delay(350);
    const beforeGold = save.gold;
    const buy = [...document.querySelectorAll<HTMLButtonElement>('.camp-btn')].find(b => b.textContent?.includes('均等に強化'));
    const canBuy = !!buy && !buy.disabled && buy.getAttribute('aria-disabled') !== 'true';
    measurements.purchaseAvailable = canBuy;
    if (canBuy) buy!.click(); await delay(350);
    if (canBuy && save.gold >= beforeGold) failures.push('Party purchase did not spend Gold');
    document.querySelector<HTMLButtonElement>('[data-tab="tree"]')!.click(); await delay(350);
    document.querySelector<HTMLButtonElement>('[data-tab="expedition"]')!.click(); await delay(350);
    visible(button, 'Departure after tabs and purchase');
    if (Math.abs(button.getBoundingClientRect().y - initial.y) > 1) failures.push('Departure moved after tab/purchase/notification changes');
    if (late) {
      document.querySelector<HTMLButtonElement>('[data-area="ruins"]')!.click(); await delay(350);
      if (!document.querySelector('.camp-depart-destination')!.textContent?.includes('Drowned')) failures.push('Destination did not update');
      if (Math.abs(button.getBoundingClientRect().y - initial.y) > 1) failures.push('Departure moved after area change');
      document.querySelector<HTMLButtonElement>('[data-area="heart"]')!.click(); await delay(350);
    }
    button.click(); if (started !== save.selectedArea) failures.push('Departure did not start selected area');
    button.classList.remove('is-launching');
    measurements.departure = rect(button); measurements.color = getComputedStyle(button).color;
    measurements.background = getComputedStyle(button).backgroundImage;
    scroll.scrollTop = 0;
  }
  if (document.documentElement.scrollWidth > innerWidth) failures.push('Horizontal document overflow');
  const report = { scenario, measurements, failures };
  document.body.dataset.result = failures.length ? 'failed' : 'passed';
  parent.postMessage({ type: 'ui-layout-result', report }, location.origin);
}
void audit().catch(error => parent.postMessage({ type: 'ui-layout-result', report: { scenario, failures: [String(error.stack ?? error)] } }, location.origin));
