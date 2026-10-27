// Tiny DOM helpers for the camp screens (no framework, no dependencies).
import { formatNum } from '../../core/balance.ts';
import { frameCount, getUnitSprite, iconDataURL, type IconKey, type SpritePose } from '../../render/sprites/index.ts';

export type Child = Node | string | number | null | undefined | false | Child[];

type Listeners = Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  style?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  data?: Record<string, string>;
  on?: Listeners;
}

function applyProps(el: HTMLElement | SVGElement, p: Props): void {
  if (p.class) el.setAttribute('class', p.class);
  if (p.text !== undefined) el.textContent = p.text;
  if (p.title) el.setAttribute('title', p.title);
  if (p.style) el.setAttribute('style', p.style);
  if (p.attrs) {
    for (const [k, v] of Object.entries(p.attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (p.data) for (const [k, v] of Object.entries(p.data)) el.dataset[k] = v;
  if (p.on) {
    for (const [k, fn] of Object.entries(p.on)) if (fn) el.addEventListener(k, fn as EventListener);
  }
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  }
}

/** Create an HTML element. `props` may be a class-name string. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | string | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (typeof props === 'string') el.className = props;
  else if (props) applyProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | null | undefined> | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Set text only when it changed (avoids needless layout work). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

// ─────────────────────────── Icons & sprites ───────────────────────────

const iconCache = new Map<string, string>();

export function iconURL(key: IconKey, scale = 2): string {
  const id = `${key}|${scale}`;
  let u = iconCache.get(id);
  if (u === undefined) {
    try {
      u = iconDataURL(key, scale);
    } catch {
      u = '';
    }
    iconCache.set(id, u);
  }
  return u;
}

/** Pixel icon <img>. `size` is the CSS pixel size (rendered crisp at an integer scale). */
export function icon(key: IconKey, size = 32, cls = ''): HTMLImageElement {
  const scale = Math.max(1, Math.round(size / 16));
  const img = h('img', {
    class: `camp-icon ${cls}`.trim(),
    attrs: { src: iconURL(key, scale), width: size, height: size, alt: '', draggable: 'false' },
  });
  return img;
}

/**
 * Draw a unit sprite centred (feet anchored) into `c`, integer-scaled for crisp pixels.
 * `silhouette` paints it as a dark shape (unrecruited heroes).
 */
export function drawSprite(c: HTMLCanvasElement, key: string, pose: SpritePose, frame: number, tier: number, silhouette = false): void {
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  let spr;
  try {
    const n = Math.max(1, frameCount(key, pose));
    spr = getUnitSprite(key, pose, frame % n, tier);
  } catch {
    return;
  }
  const sw = spr.width;
  const sh = spr.height;
  if (!sw || !sh) return;
  const base = getUnitSprite(key, 'idle', 0, tier);
  const half = Math.max(base.ax, base.width - base.ax, 1) * 1.22;
  const up = Math.max(base.ay, 1) * 1.22;
  const scale = Math.min((c.width - 8) / (2 * half), (c.height - 10) / up);
  const footX = Math.round(c.width / 2);
  const footY = c.height - 8;
  // ground shadow
  g.fillStyle = 'rgba(0, 0, 0, 0.4)';
  g.beginPath();
  g.ellipse(footX, footY, Math.min(c.width * 0.36, half * scale * 0.9), 4, 0, 0, Math.PI * 2);
  g.fill();
  g.imageSmoothingEnabled = true;
  g.drawImage(spr.canvas, Math.round(footX - spr.ax * scale), Math.round(footY - spr.ay * scale), sw * scale, sh * scale);
  if (silhouette) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#07050b';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
}

// ─────────────────────────── Formatting ───────────────────────────

export const fmt = formatNum;

/** Stat value: one decimal below 100, compact notation above. */
export function fmtStat(n: number): string {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) < 100) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return formatNum(n);
}

export function fmtPct(f: number, digits = 0): string {
  return `${(f * 100).toFixed(digits)}%`;
}

/** Briefly flash a CSS animation class on an element (restartable). */
export function flashClass(el: Element, cls: string, ms = 900): void {
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
  const anyEl = el as Element & { __campTimers?: Record<string, number> };
  anyEl.__campTimers ??= {};
  window.clearTimeout(anyEl.__campTimers[cls]);
  anyEl.__campTimers[cls] = window.setTimeout(() => el.classList.remove(cls), ms);
}

/** A big pressable button with optional key-cap. */
export function keycap(label: string): HTMLElement {
  return h('kbd', 'camp-kbd', label);
}
