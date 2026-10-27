// スキルツリー / Skill Tree tab: SVG rendering of TREE in its 1200x800 layout (fit by default,
// wheel zoom + drag pan), node detail panel with requirement checklist, and Ember purchases.
import { buyNode, nodeView, ownedSynergies, type NodeStatus, type NodeView } from '../../core/state.ts';
import { HERO_ORDER, type HeroId, type SaveData, type TreeBranch, type TreeNodeDef } from '../../core/types.ts';
import { HEROES } from '../../data/heroes.ts';
import { SYNERGY_IDS, TREE, TREE_BY_ID } from '../../data/tree.ts';
import { append, clear, flashClass, fmt, h, icon, keycap, s, setAttr, setText } from './dom.ts';
import { BRANCH_LABEL, BUILD_COLOR, HERO_COLOR, KIND_LABEL, nodeColor, type CampHost, type TabView } from './host.ts';

const MIN_W = 380;
const LINE_H = 17;
const LABEL_ASCENT = 13; // baseline offset from the top of a 16px label line
const CHAR_W = 8.4; // approx. advance of a Latin glyph in a 16px label
const BUILD_CHAR_W = 9;

const RADIUS: Record<TreeNodeDef['kind'], number> = {
  stat: 22,
  ability: 26,
  behavior: 26,
  synergy: 25,
  keystone: 33,
  root: 30,
};

const C = {
  gold: '#ffd84a',
  goldSoft: '#ffe9a8',
  dark: '#1d1526',
  darker: '#140e1a',
  void: '#0b0810',
  line: '#3d2e4f',
  lineHi: '#5e4876',
  ink: '#1a0f14',
  bad: '#ff5a5a',
  ember: '#ff8a3d',
};

const REGIONS: { hero: HeroId; cx: number; cy: number; lx: number; ly: number }[] = [
  { hero: 'guardian', cx: 380, cy: 215, lx: 330, ly: 58 },
  { hero: 'ranger', cx: 820, cy: 215, lx: 870, ly: 58 },
  { hero: 'arcanist', cx: 820, cy: 585, lx: 870, ly: 756 },
  { hero: 'oracle', cx: 380, cy: 585, lx: 330, ly: 756 },
];

interface NodeEls {
  def: TreeNodeDef;
  g: SVGGElement;
  body: SVGGElement;
  shape: SVGElement;
  glyph: SVGElement;
  glyphStroke: boolean;
  lock: SVGGElement;
  pips: SVGCircleElement[];
  label: SVGTextElement;
  cost: SVGGElement;
  costText: SVGTextElement;
  r: number;
  color: string;
  status: NodeStatus | null;
}

interface EdgeEls {
  from: string;
  to: string;
  el: SVGLineElement;
  dashed: boolean;
}

interface ReqItem {
  text: string;
  ok: boolean;
  sub?: { text: string; ok: boolean }[];
}

// ─────────────────────────── geometry helpers ───────────────────────────

function polyPoints(n: number, r: number, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

function starPoints(n: number, ro: number, ri: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = ((-90 + (180 / n) * i) * Math.PI) / 180;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

function arcPath(r: number, a0: number, a1: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x0 = Math.cos(rad(a0)) * r;
  const y0 = Math.sin(rad(a0)) * r;
  const x1 = Math.cos(rad(a1)) * r;
  const y1 = Math.sin(rad(a1)) * r;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function splitName(name: string): string[] {
  if (name.length <= 10 || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)];
}

function isHeroBranch(b: TreeBranch): b is HeroId {
  return b === 'guardian' || b === 'ranger' || b === 'arcanist' || b === 'oracle';
}

// ─────────────────────────── static label layout ───────────────────────────
// Node positions are fixed (1200 x 800), so labels are placed once with a tiny greedy solver:
// each label block (name lines + synergy build tag) tries below / above / sides / diagonals and
// takes the spot with the least overlap against node discs, rank pips, cost badges and labels.

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Disc {
  x: number;
  y: number;
  r: number;
}

interface LabelPos {
  anchor: 'start' | 'middle' | 'end';
  dx: number;
  dy: number; // first baseline, relative to the node centre
}

const BUILD_LINE_H = 14;

function boxOverlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function discOverlap(b: Box, c: Disc): number {
  if (b.x1 <= c.x - c.r || b.x0 >= c.x + c.r || b.y1 <= c.y - c.r || b.y0 >= c.y + c.r) return 0;
  const step = 3;
  let n = 0;
  for (let y = b.y0 + step / 2; y < b.y1; y += step) {
    for (let x = b.x0 + step / 2; x < b.x1; x += step) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < c.r * c.r) n++;
    }
  }
  return n * step * step;
}

/** Radius of the node body including the class ring. */
function bodyRadius(n: TreeNodeDef): number {
  const r = RADIUS[n.kind];
  if (n.pair && n.pair.length >= 2) return r + (n.id === 'emberbond' ? 10 : 8);
  return r + 2;
}

function showsBuild(n: TreeNodeDef): boolean {
  return !!n.build && n.id !== 'emberbond';
}

/** Extra space above the body used by rank pips. */
function topExtra(n: TreeNodeDef): number {
  return n.maxRank > 1 ? 16 : 0;
}

function layoutLabels(): { labels: Map<string, LabelPos>; bounds: Box } {
  const labels = new Map<string, LabelPos>();
  const discs: { id: string; d: Disc }[] = [];
  const boxes: Box[] = [];
  const bounds: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (b: Box) => {
    bounds.x0 = Math.min(bounds.x0, b.x0);
    bounds.y0 = Math.min(bounds.y0, b.y0);
    bounds.x1 = Math.max(bounds.x1, b.x1);
    bounds.y1 = Math.max(bounds.y1, b.y1);
  };
  for (const n of TREE) {
    const R = bodyRadius(n) + 2;
    discs.push({ id: n.id, d: { x: n.x, y: n.y, r: R } });
    grow({ x0: n.x - R, y0: n.y - R - (n.kind === 'root' ? 14 : 0), x1: n.x + R, y1: n.y + R });
    const r = RADIUS[n.kind];
    if (n.maxRank > 1) {
      const pips = { x0: n.x - n.maxRank * 6 - 2, y0: n.y - r - 16, x1: n.x + n.maxRank * 6 + 2, y1: n.y - r - 4 };
      boxes.push(pips);
      grow(pips);
    }
    if (n.kind !== 'root') {
      const badge = { x0: n.x + r * 0.72, y0: n.y - r * 0.72 - 17, x1: n.x + r * 0.72 + 32, y1: n.y - r * 0.72 + 1 };
      boxes.push(badge);
      grow(badge);
    }
  }
  for (const r of REGIONS) {
    const b = { x0: r.lx - 88, y0: r.ly - 14, x1: r.lx + 88, y1: r.ly + 10 };
    boxes.push(b);
    grow(b);
  }
  interface Cand {
    pos: LabelPos;
    box: Box;
    bias: number;
  }
  const cands = new Map<string, Cand[]>();
  for (const n of TREE) {
    if (n.kind === 'root') continue; // the lantern speaks for itself
    const lines = splitName(n.name);
    const build = showsBuild(n) ? n.build! : '';
    const w = Math.max(Math.max(...lines.map((l) => l.length)) * CHAR_W, build.length * BUILD_CHAR_W) + 4;
    const hh = lines.length * LINE_H + (build ? BUILD_LINE_H : 0);
    const R = bodyRadius(n) + 2;
    const below = n.y + R + 2;
    const above = n.y - R - topExtra(n) - 2 - hh;
    const mid = n.y - hh / 2;
    const mk = (anchor: LabelPos['anchor'], dx: number, top: number, x0: number, bias: number): Cand => ({
      pos: { anchor, dx, dy: top - n.y + LABEL_ASCENT },
      box: { x0, y0: top, x1: x0 + w, y1: top + hh },
      bias,
    });
    cands.set(n.id, [
      mk('middle', 0, below, n.x - w / 2, 0),
      mk('middle', 0, above, n.x - w / 2, 15),
      mk('start', R + 4, mid, n.x + R + 4, 30),
      mk('end', -(R + 4), mid, n.x - R - 4 - w, 30),
      mk('start', R + 2, mid + hh / 2 + 6, n.x + R + 2, 35),
      mk('end', -(R + 2), mid + hh / 2 + 6, n.x - R - 2 - w, 35),
      mk('start', R + 2, mid - hh / 2 - 6, n.x + R + 2, 38),
      mk('end', -(R + 2), mid - hh / 2 - 6, n.x - R - 2 - w, 38),
      mk('end', 12, below, n.x + 12 - w, 45),
      mk('start', -12, below, n.x - 12, 45),
      mk('end', 12, above, n.x + 12 - w, 50),
      mk('start', -12, above, n.x - 12, 50),
    ]);
  }
  const chosen = new Map<string, Cand>();
  const costOf = (id: string, c: Cand): number => {
    const b = c.box;
    let cost = c.bias;
    for (const d of discs) if (d.id !== id) cost += discOverlap(b, d.d) * 1.5;
    for (const o of boxes) cost += boxOverlap(b, o);
    for (const [other, oc] of chosen) if (other !== id) cost += boxOverlap(b, oc.box) * 2;
    // keep labels on the 1200 x 800 board
    cost += (Math.max(0, -b.x0) + Math.max(0, b.x1 - 1200) + Math.max(0, -b.y0) + Math.max(0, b.y1 - 800)) * 60;
    return cost;
  };
  // greedy pass, then a few local-improvement passes (re-place each label against all others)
  for (let pass = 0; pass < 4; pass++) {
    for (const [id, list] of cands) {
      chosen.delete(id);
      let best = list[0];
      let bestCost = Infinity;
      for (const c of list) {
        const cost = costOf(id, c);
        if (cost < bestCost) {
          best = c;
          bestCost = cost;
        }
      }
      chosen.set(id, best);
    }
  }
  for (const [id, c] of chosen) {
    labels.set(id, c.pos);
    grow(c.box);
  }
  return { labels, bounds };
}

const LAYOUT = layoutLabels();
const PAD = 10;
const FIT = {
  x: Math.floor(LAYOUT.bounds.x0 - PAD),
  y: Math.floor(LAYOUT.bounds.y0 - PAD),
  w: Math.ceil(LAYOUT.bounds.x1 - LAYOUT.bounds.x0 + PAD * 2),
  h: Math.ceil(LAYOUT.bounds.y1 - LAYOUT.bounds.y0 + PAD * 2),
};

function owned(save: SaveData, id: string): boolean {
  return (save.tree[id] ?? 0) > 0;
}

function requirements(save: SaveData, n: TreeNodeDef): ReqItem[] {
  const items: ReqItem[] = [];
  const r = n.req;
  if (r.prestige) items.push({ text: `Rekindle（転生）${r.prestige}回以上`, ok: save.prestige >= r.prestige });
  const heroes = new Set<HeroId>([...(r.hero ?? []), ...(n.pair ?? [])]);
  if (isHeroBranch(n.branch)) heroes.add(n.branch);
  for (const hId of HERO_ORDER) {
    if (heroes.has(hId)) items.push({ text: `${HEROES[hId].name}が加入`, ok: save.heroes[hId].recruited });
  }
  if (r.anyOf && r.anyOf.length) {
    const ids = r.anyOf;
    if (ids.length === 1) items.push({ text: `${TREE_BY_ID[ids[0]].name}を習得`, ok: owned(save, ids[0]) });
    else {
      items.push({
        text: 'いずれか1つを習得',
        ok: ids.some((id) => owned(save, id)),
        sub: ids.map((id) => ({ text: TREE_BY_ID[id].name, ok: owned(save, id) })),
      });
    }
  }
  if (r.allOf && r.allOf.length) {
    items.push({
      text: 'すべて習得',
      ok: r.allOf.every((id) => owned(save, id)),
      sub: r.allOf.map((id) => ({ text: TREE_BY_ID[id].name, ok: owned(save, id) })),
    });
  }
  if (r.synergyCount) {
    const c = ownedSynergies(save);
    items.push({ text: `シナジーを${r.synergyCount}つ習得（${Math.min(c, r.synergyCount)}/${r.synergyCount}）`, ok: c >= r.synergyCount });
  }
  return items;
}

// ─────────────────────────── the tab ───────────────────────────

export class TreeTab implements TabView {
  readonly el: HTMLElement;
  private host: CampHost;
  private hints: HTMLElement;
  private emberVal: HTMLElement;
  private goalBox: HTMLElement;
  private countVal: HTMLElement;
  private stage: HTMLElement;
  private svg: SVGSVGElement;
  private fxG: SVGGElement;
  private regionEls = new Map<HeroId, { tint: SVGEllipseElement; label: SVGGElement }>();
  private nodes = new Map<string, NodeEls>();
  private edges: EdgeEls[] = [];
  private tip: HTMLElement;
  private detail: HTMLElement;
  private selected: string | null = null;
  private hovered: string | null = null;
  private visible = false;
  private view = { ...FIT };
  private anim = 0;
  private drag: { id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
  private suppressClick = false;
  private lastHoverSfx = 0;

  constructor(host: CampHost) {
    this.host = host;
    this.hints = h('div', 'camp-hints');
    this.emberVal = h('span', 'camp-purse-val camp-num camp-ember', '0');
    this.goalBox = h('div', 'camp-goal');
    this.countVal = h('span', 'camp-num', '');
    this.svg = this.buildSvg();
    this.fxG = this.svg.querySelector('.camp-tree-fx') as SVGGElement;
    this.tip = h('div', 'camp-tree-tip');
    const zoom = h(
      'div',
      'camp-tree-zoom',
      h('button', { class: 'camp-btn camp-btn--icon', attrs: { type: 'button', 'aria-label': '拡大' }, data: { tip: '拡大|ホイール・＋キーでも拡大' }, on: { click: () => this.zoomBy(1 / 1.35) } }, '＋'),
      h('button', { class: 'camp-btn camp-btn--icon', attrs: { type: 'button', 'aria-label': '縮小' }, data: { tip: '縮小|ホイール・－キーでも縮小' }, on: { click: () => this.zoomBy(1.35) } }, '－'),
      h('button', { class: 'camp-btn camp-btn--icon', attrs: { type: 'button', 'aria-label': '全体表示' }, data: { tip: '全体表示|0キー・背景のダブルクリックでも' }, on: { click: () => this.fit() } }, '全体'),
    );
    const legend = h(
      'div',
      'camp-tree-legend',
      h('span', null, h('i', 'camp-lg camp-lg--stat'), 'ステータス'),
      h('span', null, h('i', 'camp-lg camp-lg--ability'), '新能力・挙動'),
      h('span', null, h('i', 'camp-lg camp-lg--keystone'), 'キーストーン'),
      h('span', null, h('i', 'camp-lg camp-lg--synergy'), 'シナジー'),
    );
    this.stage = h('div', 'camp-tree-stage', this.svg, this.tip, zoom, legend);
    this.detail = h('aside', 'camp-tree-detail');
    this.el = h(
      'div',
      'camp-page camp-page--tree',
      this.hints,
      h(
        'div',
        'camp-tree-head',
        h('div', 'camp-purse camp-purse--ember', icon('ember', 32), h('div', null, h('div', 'camp-label', '所持Ember'), this.emberVal)),
        this.goalBox,
        h('div', 'camp-tree-count', h('span', 'camp-label', '習得'), this.countVal),
      ),
      h('div', 'camp-tree-body', this.stage, this.detail),
    );
    this.bindStage();
  }

  // ─────────────────────────── TabView ───────────────────────────

  update(): void {
    const save = this.host.save();
    setText(this.emberVal, fmt(save.embers));
    const views = new Map<string, NodeView>();
    for (const n of TREE) views.set(n.id, nodeView(save, n.id));
    for (const ne of this.nodes.values()) this.updateNode(ne, views.get(ne.def.id)!);
    for (const e of this.edges) this.updateEdge(e, save);
    for (const [hero, r] of this.regionEls) {
      const rec = save.heroes[hero].recruited;
      r.tint.classList.toggle('is-sealed', !rec);
      r.label.classList.toggle('is-sealed', !rec);
    }
    const ownedCount = TREE.filter((n) => n.kind !== 'root' && owned(save, n.id)).length;
    setText(this.countVal, `${ownedCount} / ${TREE.length - 1}`);
    this.renderGoal(views);
    this.renderDetail();
    if (this.visible) this.checkSynergyHint(views);
  }

  onShow(): void {
    this.visible = true;
    if (!this.selected) {
      const goal = this.nextGoal(this.allViews());
      this.selected = goal ? goal.node.id : 'core';
      this.update();
    }
    this.host.hint(
      this.hints,
      'campTreeHelp',
      'Emberでスキルツリーを強化',
      '光っているノードは今すぐ習得できる。クリックで詳細、ダブルクリック／Enterで習得。ホイールで拡大・ドラッグで移動。',
    );
    this.checkSynergyHint(new Map(this.allViews().map((v) => [v.node.id, v])));
  }

  onHide(): void {
    this.visible = false;
    this.hovered = null;
    this.tip.classList.remove('is-on');
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key;
    if (k === 'Enter') {
      if (this.selected) this.buy(this.selected, true);
      return true;
    }
    if (k === 'Escape') {
      if (!this.selected) return false;
      this.selected = null;
      this.update();
      return true;
    }
    if (k === '+' || k === '=') {
      this.zoomBy(1 / 1.35);
      return true;
    }
    if (k === '-' || k === '_') {
      this.zoomBy(1.35);
      return true;
    }
    if (k === '0') {
      this.fit();
      return true;
    }
    return false;
  }

  hasAction(): boolean {
    const save = this.host.save();
    return TREE.some((n) => nodeView(save, n.id).affordable);
  }

  // ─────────────────────────── SVG construction ───────────────────────────

  private buildSvg(): SVGSVGElement {
    const defs = s(
      'defs',
      null,
      s('filter', { id: 'campTree-glow', x: '-80%', y: '-80%', width: '260%', height: '260%' }, s('feGaussianBlur', { stdDeviation: 7 })),
      s(
        'radialGradient',
        { id: 'campTree-core', cx: '50%', cy: '60%', r: '65%' },
        s('stop', { offset: '0', 'stop-color': '#fff3c4' }),
        s('stop', { offset: '0.45', 'stop-color': '#ffb35a' }),
        s('stop', { offset: '1', 'stop-color': '#c4501c' }),
      ),
      s(
        'linearGradient',
        { id: 'campTree-band', x1: '0', x2: '1', y1: '0', y2: '0' },
        s('stop', { offset: '0', 'stop-color': C.ember, 'stop-opacity': '0' }),
        s('stop', { offset: '0.5', 'stop-color': C.ember, 'stop-opacity': '0.12' }),
        s('stop', { offset: '1', 'stop-color': C.ember, 'stop-opacity': '0' }),
      ),
    );
    for (const hero of HERO_ORDER) {
      defs.appendChild(
        s(
          'radialGradient',
          { id: `campTree-region-${hero}`, cx: '50%', cy: '50%', r: '50%' },
          s('stop', { offset: '0', 'stop-color': HERO_COLOR[hero], 'stop-opacity': '0.2' }),
          s('stop', { offset: '0.6', 'stop-color': HERO_COLOR[hero], 'stop-opacity': '0.07' }),
          s('stop', { offset: '1', 'stop-color': HERO_COLOR[hero], 'stop-opacity': '0' }),
        ),
      );
    }
    // Split fills for synergy nodes (one colour per class).
    for (const n of TREE) {
      if (!n.pair || n.pair.length < 2) continue;
      const grad = s('linearGradient', { id: `campTree-syn-${n.id}`, x1: '0', y1: '0', x2: '1', y2: '1' });
      const k = n.pair.length;
      n.pair.forEach((hero, i) => {
        grad.appendChild(s('stop', { offset: (i / k).toFixed(3), 'stop-color': HERO_COLOR[hero] }));
        grad.appendChild(s('stop', { offset: ((i + 1) / k).toFixed(3), 'stop-color': HERO_COLOR[hero] }));
      });
      defs.appendChild(grad);
    }

    const regions = s('g', { class: 'camp-tree-regions' });
    regions.appendChild(s('rect', { class: 'camp-tree-band', x: 300, y: 370, width: 760, height: 60, rx: 30, fill: 'url(#campTree-band)' }));
    for (const r of REGIONS) {
      const tint = s('ellipse', { class: 'camp-tree-tint', cx: r.cx, cy: r.cy, rx: 330, ry: 250, fill: `url(#campTree-region-${r.hero})` });
      const label = s(
        'g',
        { class: 'camp-tree-region-label', transform: `translate(${r.lx} ${r.ly})` },
        s('text', { 'text-anchor': 'middle', y: 6, fill: HERO_COLOR[r.hero] }, HEROES[r.hero].name.toUpperCase()),
        s(
          'g',
          { class: 'camp-tree-region-lock', transform: 'translate(-78 0)' },
          s('path', { d: 'M-5 -2V-6A5 5 0 0 1 5 -6V-2', fill: 'none', stroke: '#8a7a90', 'stroke-width': 2.5 }),
          s('rect', { x: -7.5, y: -2, width: 15, height: 11, rx: 2, fill: '#8a7a90' }),
        ),
      );
      regions.append(tint, label);
      this.regionEls.set(r.hero, { tint, label });
    }

    const edgeG = s('g', { class: 'camp-tree-edges' });
    for (const n of TREE) {
      const add = (from: string, dashed: boolean) => {
        if (n.branch === 'rekindled' && from === 'core') return;
        const a = TREE_BY_ID[from];
        if (!a) return;
        const el = s('line', { class: 'camp-edge', x1: a.x, y1: a.y, x2: n.x, y2: n.y });
        edgeG.appendChild(el);
        this.edges.push({ from, to: n.id, el, dashed });
      };
      for (const id of n.req.anyOf ?? []) add(id, true);
      for (const id of n.req.allOf ?? []) add(id, false);
    }

    const nodeG = s('g', { class: 'camp-tree-nodes' });
    for (const n of TREE) {
      const ne = this.buildNode(n);
      this.nodes.set(n.id, ne);
      nodeG.appendChild(ne.g);
    }

    return s(
      'svg',
      {
        class: 'camp-tree-svg',
        viewBox: `${FIT.x} ${FIT.y} ${FIT.w} ${FIT.h}`,
        preserveAspectRatio: 'xMidYMid meet',
        role: 'img',
        'aria-label': 'スキルツリー',
      },
      defs,
      regions,
      edgeG,
      nodeG,
      s('g', { class: 'camp-tree-fx' }),
    );
  }

  private buildNode(def: TreeNodeDef): NodeEls {
    const r = RADIUS[def.kind];
    const color = nodeColor(def);
    const isEmberbond = def.id === 'emberbond';
    const g = s('g', { class: `camp-node camp-node--${def.kind}`, transform: `translate(${def.x} ${def.y})`, 'data-id': def.id });
    const body = s('g', { class: 'camp-node-body' });
    body.appendChild(s('circle', { class: 'camp-node-glow', r: r + 14, fill: def.kind === 'root' ? C.ember : color, filter: 'url(#campTree-glow)' }));
    body.appendChild(s('circle', { class: 'camp-node-sel', r: r + 10 }));
    body.appendChild(s('circle', { class: 'camp-node-ping', r: r + 4, stroke: color }));

    let shape: SVGElement;
    switch (def.kind) {
      case 'stat':
        shape = s('circle', { r });
        break;
      case 'ability':
      case 'behavior':
        shape = s('polygon', { points: polyPoints(4, r) });
        break;
      case 'keystone':
        shape = s('polygon', { points: polyPoints(6, r) });
        break;
      case 'synergy':
        shape = s('circle', { r });
        break;
      case 'root':
      default:
        body.appendChild(s('path', { class: 'camp-node-handle', d: 'M-10 -26 Q0 -40 10 -26', fill: 'none', 'stroke-width': 3 }));
        shape = s('path', { d: 'M-15 -26 H15 L20 14 Q20 22 12 22 H-12 Q-20 22 -20 14 Z' });
        break;
    }
    shape.setAttribute('class', 'camp-node-shape');
    body.appendChild(shape);

    if (def.pair && def.pair.length >= 2) {
      const k = def.pair.length;
      const rr = r + (isEmberbond ? 8 : 6);
      def.pair.forEach((hero, i) => {
        const a0 = -90 + (360 / k) * i + 6;
        const a1 = -90 + (360 / k) * (i + 1) - 6;
        body.appendChild(s('path', { class: 'camp-node-ring', d: arcPath(rr, a0, a1), stroke: HERO_COLOR[hero] }));
      });
    }

    let glyph: SVGElement;
    let glyphStroke = false;
    switch (def.kind) {
      case 'stat':
        glyph = s('path', { d: 'M-7 0H7M0 -7V7' });
        glyphStroke = true;
        break;
      case 'ability':
        glyph = s('polygon', { points: starPoints(4, 11, 3.8) });
        break;
      case 'behavior':
        glyph = s('path', { d: 'M-9 -4H5M1 -8L5 -4L1 0M9 4H-5M-1 0L-5 4L-1 8' });
        glyphStroke = true;
        break;
      case 'keystone':
        glyph = s('polygon', { points: starPoints(5, isEmberbond ? 15 : 13, isEmberbond ? 6.5 : 5.5) });
        break;
      case 'synergy':
        glyph = s('polygon', { points: starPoints(4, 13, 4.5) });
        break;
      case 'root':
      default:
        glyph = s('path', { class: 'camp-node-flame', d: 'M0 -16 C8 -6 9 6 0 13 C-9 6 -8 -6 0 -16 Z' });
        break;
    }
    glyph.classList.add('camp-node-glyph');
    if (glyphStroke) glyph.classList.add('is-stroke');
    body.appendChild(glyph);

    const lock = s(
      'g',
      { class: 'camp-node-lock' },
      s('path', { d: 'M-5 -2V-6A5 5 0 0 1 5 -6V-2', fill: 'none', stroke: '#8a7a90', 'stroke-width': 2.5 }),
      s('rect', { x: -7.5, y: -2, width: 15, height: 11, rx: 2, fill: '#8a7a90' }),
      s('circle', { cx: 0, cy: 3.5, r: 1.8, fill: C.void }),
    );
    body.appendChild(lock);
    g.appendChild(body);

    const pips: SVGCircleElement[] = [];
    if (def.maxRank > 1) {
      const pg = s('g', { class: 'camp-node-pips' });
      for (let i = 0; i < def.maxRank; i++) {
        const p = s('circle', { cx: (i - (def.maxRank - 1) / 2) * 12, cy: -(r + 10), r: 4.2 });
        pips.push(p);
        pg.appendChild(p);
      }
      g.appendChild(pg);
    }

    const label = s('text', { class: 'camp-node-label' });
    const lp = LAYOUT.labels.get(def.id);
    if (lp) {
      const lx = Math.round(lp.dx);
      label.setAttribute('text-anchor', lp.anchor);
      label.setAttribute('y', String(Math.round(lp.dy)));
      splitName(def.name).forEach((ln, i) => label.appendChild(s('tspan', { x: lx, dy: i === 0 ? 0 : LINE_H }, ln)));
      if (def.build && showsBuild(def)) {
        label.appendChild(s('tspan', { class: 'camp-node-build', x: lx, dy: BUILD_LINE_H + 1, fill: BUILD_COLOR[def.build] ?? C.goldSoft }, def.build));
      }
    }
    g.appendChild(label);

    const ox = Math.round(r * 0.72 + 3);
    const oy = Math.round(-r * 0.72 - 3);
    const costText = s('text', { x: 7, y: 5 }, '');
    const cost = s(
      'g',
      { class: 'camp-node-cost', transform: `translate(${ox} ${oy})` },
      s('polygon', { points: polyPoints(4, 5), fill: C.ember }),
      costText,
    );
    g.appendChild(cost);

    g.addEventListener('pointerenter', () => this.hover(def.id));
    g.addEventListener('pointerleave', () => this.hover(null));
    g.addEventListener('click', () => {
      if (this.suppressClick) return;
      this.select(def.id);
    });
    g.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.buy(def.id, true);
    });

    return { def, g, body, shape, glyph, glyphStroke, lock, pips, label, cost, costText, r, color, status: null };
  }

  // ─────────────────────────── updating ───────────────────────────

  private allViews(): NodeView[] {
    const save = this.host.save();
    return TREE.map((n) => nodeView(save, n.id));
  }

  private updateNode(ne: NodeEls, v: NodeView): void {
    const { def, g } = ne;
    const prev = ne.status;
    ne.status = v.status;
    setAttr(g, 'data-status', v.status);
    g.classList.toggle('is-owned', v.rank > 0);
    g.classList.toggle('is-affordable', v.affordable);
    g.classList.toggle('is-selected', def.id === this.selected);

    let fill: string;
    let stroke: string;
    let glyph: string;
    if (def.kind === 'root') {
      fill = 'url(#campTree-core)';
      stroke = C.gold;
      glyph = '#fff6d8';
    } else if (v.rank > 0) {
      fill = def.pair && def.pair.length >= 2 ? `url(#campTree-syn-${def.id})` : ne.color;
      stroke = v.status === 'maxed' ? C.gold : C.goldSoft;
      glyph = C.ink;
    } else if (v.status === 'available') {
      fill = C.dark;
      stroke = ne.color;
      glyph = ne.color;
    } else if (v.status === 'locked') {
      fill = C.darker;
      stroke = C.lineHi;
      glyph = C.lineHi;
    } else {
      fill = C.void;
      stroke = '#2a1f36';
      glyph = 'none';
    }
    setAttr(ne.shape, 'fill', fill);
    setAttr(ne.shape, 'stroke', stroke);
    if (ne.glyphStroke) {
      setAttr(ne.glyph, 'stroke', glyph);
      setAttr(ne.glyph, 'fill', 'none');
    } else {
      setAttr(ne.glyph, 'fill', glyph);
    }
    ne.pips.forEach((p, i) => {
      setAttr(p, 'fill', i < v.rank ? C.gold : C.darker);
      setAttr(p, 'stroke', i < v.rank ? '#fff1b8' : v.status === 'sealed' ? '#2a1f36' : ne.color);
    });
    const showCost = (v.status === 'available' || v.status === 'upgradable') && v.cost !== null && def.kind !== 'root';
    ne.cost.classList.toggle('is-on', showCost);
    ne.cost.classList.toggle('is-poor', showCost && !v.affordable);
    if (showCost) setText(ne.costText, fmt(v.cost!));
    if (prev && (prev === 'locked' || prev === 'sealed') && (v.status === 'available' || v.status === 'upgradable')) {
      flashClass(g, 'is-unlocked', 1400);
    }
  }

  private updateEdge(e: EdgeEls, save: SaveData): void {
    const from = TREE_BY_ID[e.from];
    const to = TREE_BY_ID[e.to];
    const pOwned = owned(save, e.from);
    const cOwned = owned(save, e.to);
    const child = this.nodes.get(e.to);
    const state = pOwned && cOwned ? 'active' : pOwned && child?.status !== 'sealed' ? 'open' : 'dim';
    const color = to.pair && to.pair.length >= 2 ? nodeColor(from) : nodeColor(to);
    setAttr(e.el, 'class', `camp-edge is-${state}${e.dashed ? ' is-dashed' : ''}`);
    setAttr(e.el, 'stroke', state === 'dim' ? C.line : color);
  }

  // ─────────────────────────── goal / detail ───────────────────────────

  private nextGoal(views: Iterable<NodeView>): NodeView | null {
    let best: NodeView | null = null;
    let fallback: NodeView | null = null;
    for (const v of views) {
      if (v.cost === null || v.node.kind === 'root') continue;
      if (v.status !== 'available' && v.status !== 'upgradable') continue;
      if (v.status === 'available' && v.node.kind !== 'stat') {
        if (!best || v.cost < best.cost!) best = v;
      } else if (!fallback || v.cost < fallback.cost!) {
        fallback = v;
      }
    }
    return best ?? fallback;
  }

  private renderGoal(views: Map<string, NodeView>): void {
    const save = this.host.save();
    const goal = this.nextGoal(views.values());
    clear(this.goalBox);
    if (!goal) {
      const sealed = [...views.values()].some((v) => v.status === 'sealed' || v.status === 'locked');
      this.goalBox.append(h('span', 'camp-label', '次の目標'), h('span', 'camp-goal-none', sealed ? '仲間の加入・Rekindleで新たなノードが解放' : '全ノード習得！'));
      return;
    }
    const n = goal.node;
    const cost = goal.cost!;
    const btn = h(
      'button',
      {
        class: `camp-goal-btn${goal.affordable ? ' is-ready' : ''}`,
        style: `--nc:${nodeColor(n)}`,
        attrs: { type: 'button' },
        data: { tip: '次の目標|もっとも安く習得できる新能力・挙動変化ノード\nクリックでツリー上の位置を表示' },
        on: {
          click: () => {
            this.select(n.id);
            const ne = this.nodes.get(n.id);
            if (ne) flashClass(ne.g, 'is-unlocked', 1400);
          },
        },
      },
      h('i', `camp-goal-swatch camp-goal-swatch--${n.kind}`),
      h('span', 'camp-goal-name', n.name),
      h('span', 'camp-goal-cost camp-num', icon('ember', 16), fmt(cost)),
      h('span', 'camp-goal-state', goal.affordable ? '習得可能！' : `あと ${fmt(cost - save.embers)}`),
    );
    this.goalBox.append(h('span', 'camp-label', '次の目標'), btn);
  }

  private renderDetail(): void {
    const id = this.hovered ?? this.selected;
    const save = this.host.save();
    clear(this.detail);
    if (!id || !TREE_BY_ID[id]) {
      this.detail.append(h('div', 'camp-td-empty', icon('ember', 32), h('p', null, 'ノードを選ぶと詳細が表示されます')));
      return;
    }
    const v = nodeView(save, id);
    const n = v.node;
    this.detail.style.setProperty('--nc', nodeColor(n));
    this.detail.classList.toggle('is-preview', this.hovered !== null && this.hovered !== this.selected);

    const chips = h('div', 'camp-td-chips', h('span', 'camp-chip', KIND_LABEL[n.kind]), h('span', 'camp-chip camp-chip--branch', BRANCH_LABEL[n.branch]));
    if (n.build) chips.appendChild(h('span', { class: 'camp-chip camp-chip--build', style: `--bc:${BUILD_COLOR[n.build] ?? C.goldSoft}`, text: n.build }));
    const head = h('div', 'camp-td-head', h('i', `camp-td-swatch camp-goal-swatch--${n.kind}${v.rank > 0 ? ' is-owned' : ''}`), h('div', 'camp-td-titles', h('div', 'camp-td-name', n.name), chips));

    const rankPips = h('span', 'camp-td-pips');
    for (let i = 0; i < n.maxRank; i++) rankPips.appendChild(h('i', i < v.rank ? 'is-on' : ''));
    const statusText: Record<NodeStatus, string> = {
      maxed: '習得済み',
      upgradable: '強化可能',
      available: '習得可能',
      locked: '前提が未達成',
      sealed: '封印中',
    };
    const rank = h(
      'div',
      'camp-td-rank',
      h('span', 'camp-label', 'ランク'),
      h('b', 'camp-num', `${v.rank} / ${n.maxRank}`),
      rankPips,
      h('span', `camp-td-status is-${v.status}`, statusText[v.status]),
    );

    const pair = n.pair && n.pair.length >= 2
      ? h(
          'div',
          'camp-td-pair',
          n.pair.map((hero, i) => [i > 0 ? h('span', 'camp-dim', '×') : null, h('span', { class: 'camp-td-hero', style: `--hc:${HERO_COLOR[hero]}` }, icon(`hero_${hero}`, 20), HEROES[hero].name)]),
        )
      : null;

    const reqs = n.kind === 'root' ? [] : requirements(save, n);
    const reqList = reqs.length
      ? h(
          'ul',
          'camp-td-reqs',
          reqs.map((r) =>
            h(
              'li',
              r.ok ? 'is-ok' : 'is-ng',
              h('span', 'camp-td-mark', r.ok ? '✓' : '✗'),
              h('span', null, r.text),
              r.sub
                ? h(
                    'ul',
                    null,
                    r.sub.map((sb) => h('li', sb.ok ? 'is-ok' : 'is-ng', h('span', 'camp-td-mark', sb.ok ? '✓' : '✗'), sb.text)),
                  )
                : null,
            ),
          ),
        )
      : null;

    let costRow: HTMLElement;
    if (v.cost !== null && n.kind !== 'root') {
      const poor = save.embers < v.cost;
      costRow = h(
        'div',
        'camp-td-cost',
        h('span', 'camp-label', v.rank > 0 ? '次のランク' : 'コスト'),
        h('b', `camp-num ${poor ? 'camp-bad' : 'camp-ember'}`, icon('ember', 20), fmt(v.cost)),
        h('span', 'camp-dim', `所持 ${fmt(save.embers)}`),
      );
    } else {
      costRow = h('div', 'camp-td-cost', h('span', 'camp-good', n.kind === 'root' ? 'すべての枝はここから伸びる' : '最大ランクに到達'));
    }

    const btn = h('button', { class: 'camp-btn camp-td-buy', attrs: { type: 'button' }, on: { click: () => this.buy(id, false) } });
    let ok = false;
    if (v.status === 'maxed') btn.append(n.kind === 'root' ? '起点' : '習得済み');
    else if (v.status === 'sealed') btn.append(icon('lock', 16), v.sealReason ?? '封印中');
    else if (v.status === 'locked' && v.rank === 0) btn.append('前提ノードが必要');
    else if (!v.affordable && v.cost !== null) btn.append(`Emberが足りない（あと ${fmt(v.cost - save.embers)}）`);
    else {
      ok = true;
      btn.append(h('span', null, v.rank > 0 ? `ランク${v.rank + 1}へ強化` : '習得する'), keycap('Enter'));
    }
    btn.classList.toggle('camp-btn--primary', ok);
    btn.classList.toggle('is-poor', !ok);
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');

    append(this.detail, [
      head,
      rank,
      pair,
      h('p', 'camp-td-desc', n.desc),
      reqList ? h('div', 'camp-td-section', h('div', 'camp-label', '習得条件'), reqList) : null,
      costRow,
      n.kind === 'root' ? null : btn,
      this.hovered && this.hovered !== this.selected ? h('div', 'camp-td-foot camp-dim', 'クリックで選択・ダブルクリックで習得') : null,
    ]);
  }

  private checkSynergyHint(views: Map<string, NodeView>): void {
    if (!SYNERGY_IDS.some((id) => views.get(id)?.status === 'available')) return;
    if (this.host.hint(this.hints, 'campSynergy', 'シナジー解放！', '2人のクラスを組み合わせた強力なノード（星形）が習得可能に。BULWARK・HUNT・PYRE などビルドの軸にしよう。')) {
      this.host.sfx('milestone', { volume: 0.6 });
    }
  }

  // ─────────────────────────── interaction ───────────────────────────

  private hover(id: string | null): void {
    if (this.drag?.moved) return;
    if (this.hovered === id) return;
    this.hovered = id;
    this.renderDetail();
    if (!id) {
      this.tip.classList.remove('is-on');
      return;
    }
    const now = performance.now();
    if (now - this.lastHoverSfx > 60) {
      this.lastHoverSfx = now;
      this.host.sfx('uiHover', { volume: 0.4 });
    }
    this.showTip(id);
  }

  private showTip(id: string): void {
    const ne = this.nodes.get(id);
    if (!ne) return;
    const v = nodeView(this.host.save(), id);
    let line: string;
    if (v.status === 'sealed') line = v.sealReason ?? '封印中';
    else if (v.status === 'maxed') line = ne.def.kind === 'root' ? '起点' : '習得済み';
    else if (v.status === 'locked' && v.rank === 0) line = '前提ノードが必要';
    else if (v.affordable) line = `習得可能（${fmt(v.cost!)} Ember）`;
    else line = `${fmt(v.cost ?? 0)} Ember 必要`;
    this.tip.replaceChildren(h('b', null, ne.def.name), h('span', `is-${v.status}${v.affordable ? ' is-affordable' : ''}`, line));
    const sr = this.stage.getBoundingClientRect();
    const nr = ne.body.getBoundingClientRect();
    const x = nr.left + nr.width / 2 - sr.left;
    const y = nr.top - sr.top - 6;
    this.tip.style.left = `${Math.round(x)}px`;
    this.tip.style.top = `${Math.round(y)}px`;
    this.tip.classList.toggle('is-below', y < 60);
    if (y < 60) this.tip.style.top = `${Math.round(nr.bottom - sr.top + 6)}px`;
    this.tip.classList.add('is-on');
  }

  private select(id: string): void {
    if (this.selected !== id) this.host.sfx('uiClick', { volume: 0.7 });
    this.selected = id;
    this.hovered = null;
    for (const ne of this.nodes.values()) ne.g.classList.toggle('is-selected', ne.def.id === id);
    this.renderDetail();
    if (TREE_BY_ID[id]) this.showTip(id);
  }

  private buy(id: string, fromShortcut: boolean): void {
    const save = this.host.save();
    const v = nodeView(save, id);
    const ne = this.nodes.get(id);
    if (!v.affordable || v.cost === null) {
      if (v.node.kind === 'root') return;
      this.host.sfx('uiError');
      if (ne) flashClass(ne.body, 'is-denied', 420);
      if (fromShortcut) {
        let why: string;
        if (v.status === 'maxed') why = `${v.node.name}は最大ランクです`;
        else if (v.status === 'sealed') why = v.sealReason ?? '封印されています';
        else if (v.status === 'locked') why = '前提ノードを先に習得しよう';
        else why = `Emberが足りない（あと ${fmt((v.cost ?? 0) - save.embers)}）`;
        this.host.ctx.toast(why, 'warn');
      }
      return;
    }
    const cost = v.cost;
    if (!buyNode(save, id)) {
      this.host.sfx('uiError');
      return;
    }
    this.selected = id;
    this.hovered = null;
    this.host.commit();
    this.celebrate(id, cost);
  }

  private celebrate(id: string, cost: number): void {
    const ne = this.nodes.get(id);
    if (!ne) return;
    const def = ne.def;
    const rank = this.host.save().tree[id] ?? 0;
    const big = def.kind === 'keystone' || def.kind === 'synergy' || def.branch === 'synergy';
    this.host.sfx('nodeBuy', { pitch: big ? 0.8 : 1 + (rank - 1) * 0.08 });
    flashClass(ne.body, 'is-bought', 800);
    for (const e of this.edges) if (e.to === id) flashClass(e.el, 'is-surge', 1000);

    const color = def.kind === 'root' ? C.ember : ne.color;
    const g = s('g', { class: `camp-tburst${big ? ' is-big' : ''}`, transform: `translate(${def.x} ${def.y})` });
    g.appendChild(s('circle', { class: 'camp-tburst-ring', r: ne.r, stroke: color }));
    g.appendChild(s('circle', { class: 'camp-tburst-ring camp-tburst-ring--2', r: ne.r, stroke: C.gold }));
    const count = big ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = ne.r + 22 + Math.random() * (big ? 60 : 36);
      g.appendChild(
        s('circle', {
          class: 'camp-tburst-p',
          r: (2 + Math.random() * 2.5).toFixed(1),
          fill: i % 3 === 0 ? C.gold : color,
          style: `--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;animation-delay:${Math.floor(Math.random() * 80)}ms`,
        }),
      );
    }
    g.appendChild(s('text', { class: 'camp-tburst-text', y: -ne.r - 16, 'text-anchor': 'middle' }, def.maxRank > 1 ? `RANK ${rank}` : '習得！'));
    g.appendChild(s('text', { class: 'camp-tburst-cost', y: ne.r + 4, x: ne.r + 8 }, `-${fmt(cost)}`));
    this.fxG.appendChild(g);
    window.setTimeout(() => g.remove(), 1300);
    if (big) this.host.ctx.toast(`${def.name} を習得！`, 'good');
  }

  // ─────────────────────────── zoom & pan ───────────────────────────

  private bindStage(): void {
    const svg = this.svg;
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = Math.min(1.6, Math.max(0.6, Math.pow(1.0018, e.deltaY * (e.deltaMode === 1 ? 30 : 1))));
        this.zoomAt(f, this.svgPoint(e.clientX, e.clientY), false);
      },
      { passive: false },
    );
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false };
    });
    svg.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 6 || this.view.w >= FIT.w - 0.5) return;
        d.moved = true;
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        this.stage.classList.add('is-dragging');
        this.tip.classList.remove('is-on');
      }
      const k = this.unitsPerPx();
      this.view.x = d.vx - dx * k;
      this.view.y = d.vy - dy * k;
      this.clampView();
      this.applyView();
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (d.moved) {
        this.suppressClick = true;
        window.setTimeout(() => (this.suppressClick = false), 0);
        this.stage.classList.remove('is-dragging');
      }
      this.drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('dblclick', (e) => {
      if ((e.target as Element).closest('.camp-node')) return;
      this.fit();
    });
  }

  private unitsPerPx(): number {
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) return 1;
    return Math.max(this.view.w / r.width, this.view.h / r.height);
  }

  private svgPoint(cx: number, cy: number): { x: number; y: number } {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: this.view.x + this.view.w / 2, y: this.view.y + this.view.h / 2 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  private zoomAt(f: number, p: { x: number; y: number }, animate: boolean): void {
    const w = Math.min(FIT.w, Math.max(MIN_W, this.view.w * f));
    const k = w / this.view.w;
    const target = {
      x: p.x - (p.x - this.view.x) * k,
      y: p.y - (p.y - this.view.y) * k,
      w,
      h: (w * FIT.h) / FIT.w,
    };
    if (animate) this.animateTo(target);
    else {
      this.view = target;
      this.clampView();
      this.applyView();
    }
    this.stage.classList.toggle('is-zoomed', w < FIT.w - 0.5);
  }

  private zoomBy(f: number): void {
    const focus = this.selected ? TREE_BY_ID[this.selected] : null;
    const center = { x: this.view.x + this.view.w / 2, y: this.view.y + this.view.h / 2 };
    const p = f < 1 && focus ? { x: (focus.x + center.x) / 2, y: (focus.y + center.y) / 2 } : center;
    this.zoomAt(f, p, true);
  }

  private fit(): void {
    this.animateTo({ ...FIT });
    this.stage.classList.remove('is-zoomed');
  }

  private clampView(): void {
    const v = this.view;
    if (v.w >= FIT.w - 0.01) {
      this.view = { ...FIT };
      return;
    }
    v.x = Math.min(FIT.x + FIT.w - v.w * 0.6, Math.max(FIT.x - v.w * 0.4, v.x));
    v.y = Math.min(FIT.y + FIT.h - v.h * 0.6, Math.max(FIT.y - v.h * 0.4, v.y));
  }

  private applyView(): void {
    const v = this.view;
    setAttr(this.svg, 'viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  }

  private animateTo(target: { x: number; y: number; w: number; h: number }): void {
    cancelAnimationFrame(this.anim);
    const from = { ...this.view };
    const t0 = performance.now();
    const dur = 220;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.view = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      };
      if (t >= 1) this.clampView();
      this.applyView();
      if (t < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
}
