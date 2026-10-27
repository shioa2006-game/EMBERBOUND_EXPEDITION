// Small DOM helpers shared by the app-shell UI (no framework).
import { formatNum, formatTime } from '../core/balance.ts';
import { iconDataURL, type IconKey } from '../render/sprites/index.ts';

type Child = Node | string | number | null | undefined | false;
type Children = (Child | Child[])[];
type Handler = (ev: any) => void;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  style?: string;
  title?: string;
  tip?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
  on?: Record<string, Handler>;
  type?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

/** Create an element: h('div', { class: 'x', on: { click } }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | string | null, ...children: Children): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (typeof props === 'string') {
    el.className = props;
  } else if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      switch (k) {
        case 'class':
          el.className = String(v);
          break;
        case 'text':
          el.textContent = String(v);
          break;
        case 'html':
          el.innerHTML = String(v);
          break;
        case 'style':
          el.style.cssText = String(v);
          break;
        case 'tip':
          el.dataset.tip = String(v);
          break;
        case 'dataset':
          Object.assign(el.dataset, v as Record<string, string>);
          break;
        case 'attrs':
          for (const [ak, av] of Object.entries(v as Record<string, string>)) el.setAttribute(ak, av);
          break;
        case 'on':
          for (const [ev, fn] of Object.entries(v as Record<string, Handler>)) el.addEventListener(ev, fn);
          break;
        default:
          if (typeof v === 'boolean') (el as unknown as Record<string, unknown>)[k] = v;
          else el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Children): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ─────────────────────────── cached writes (per-frame HUD updates) ───────────────────────────

const slots = new WeakMap<Element, Record<string, string>>();
function slot(el: Element): Record<string, string> {
  let s = slots.get(el);
  if (!s) {
    s = {};
    slots.set(el, s);
  }
  return s;
}

/** Set textContent only when it changed. */
export function setText(el: Element, text: string): void {
  const s = slot(el);
  if (s.__text !== text) {
    s.__text = text;
    el.textContent = text;
  }
}

/** Set a CSS custom property / style property only when it changed. */
export function setVar(el: HTMLElement, name: string, value: string): void {
  const s = slot(el);
  if (s[name] !== value) {
    s[name] = value;
    el.style.setProperty(name, value);
  }
}

export function setAttr(el: Element, name: string, value: string): void {
  const s = slot(el);
  const k = `@${name}`;
  if (s[k] !== value) {
    s[k] = value;
    el.setAttribute(name, value);
  }
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Restart a CSS animation class (e.g. a "bump" flash). */
export function flash(el: Element, cls: string, ms = 600): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  const timers = flashTimers.get(el) ?? {};
  if (timers[cls]) clearTimeout(timers[cls]);
  timers[cls] = window.setTimeout(() => el.classList.remove(cls), ms);
  flashTimers.set(el, timers);
}
const flashTimers = new WeakMap<Element, Record<string, number>>();

// ─────────────────────────── icons ───────────────────────────

const iconUrls = new Map<string, string>();

export function iconURL(key: IconKey, scale = 2): string {
  const id = `${key}|${scale}`;
  let url = iconUrls.get(id);
  if (!url) {
    try {
      url = iconDataURL(key, scale);
    } catch {
      url = '';
    }
    iconUrls.set(id, url);
  }
  return url;
}

export function icon(key: IconKey, scale = 2, cls = ''): HTMLImageElement {
  const img = h('img', { class: `px-icon ${cls}`.trim(), alt: '', draggable: 'false' });
  img.src = iconURL(key, scale);
  return img;
}

// ─────────────────────────── formatting ───────────────────────────

export const fmt = formatNum;
export const fmtSec = formatTime;

/** h:mm:ss play-clock. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Long-form playtime: 1時間23分 / 12分34秒 */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (hh > 0) return `${hh}時間${mm}分`;
  return `${mm}分${s % 60}秒`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Animate a number from `from` to `to` into `el` (ease-out). */
export function countUp(el: Element, from: number, to: number, ms: number, format: (n: number) => string = fmt): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || from === to) {
      el.textContent = format(to);
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = clamp((now - t0) / ms, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// ─────────────────────────── tooltips ───────────────────────────

let tipEl: HTMLElement | null = null;
let tipOwner: HTMLElement | null = null;

/** Global hover tooltips for any element with a data-tip attribute ("Title|body" or plain text). */
export function installTooltips(root: HTMLElement): void {
  tipEl = h('div', { class: 'tooltip', attrs: { role: 'tooltip' } });
  root.appendChild(tipEl);
  const show = (target: HTMLElement) => {
    const raw = target.dataset.tip;
    if (!raw || !tipEl) return;
    tipOwner = target;
    clear(tipEl);
    const bar = raw.indexOf('|');
    if (bar >= 0) {
      tipEl.appendChild(h('div', { class: 'tooltip-title', text: raw.slice(0, bar) }));
      for (const line of raw.slice(bar + 1).split('\n')) tipEl.appendChild(h('div', { class: 'tooltip-line', text: line }));
    } else {
      for (const line of raw.split('\n')) tipEl.appendChild(h('div', { class: 'tooltip-line', text: line }));
    }
    tipEl.classList.add('show');
    place(target);
  };
  const place = (target: HTMLElement) => {
    if (!tipEl) return;
    const r = target.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 10;
    if (y < 6) y = r.bottom + 10;
    x = clamp(x, 6, window.innerWidth - tw - 6);
    y = clamp(y, 6, window.innerHeight - th - 6);
    tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const hide = () => {
    tipOwner = null;
    tipEl?.classList.remove('show');
  };
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (t && t !== tipOwner) show(t);
    else if (!t && tipOwner) hide();
  });
  document.addEventListener('pointerdown', hide, true);
  window.addEventListener('blur', hide);
}

/** Re-read a tooltip that's currently showing (content changed). */
export function hideTooltip(): void {
  tipOwner = null;
  tipEl?.classList.remove('show');
}
