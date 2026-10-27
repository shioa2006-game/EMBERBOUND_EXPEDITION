// Small DOM "juice" effects for the camp: floating numbers, particle bursts, shakes.
import { flashClass, h } from './dom.ts';

/** Element-relative coordinates of the centre of `target` inside `layer`. */
export function centerIn(layer: HTMLElement, target: Element): { x: number; y: number } {
  const a = layer.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  return { x: b.left + b.width / 2 - a.left + layer.scrollLeft, y: b.top + b.height / 2 - a.top + layer.scrollTop };
}

/** Rising floating text at (x, y) in `layer` (layer must be position: relative). */
export function floatText(layer: HTMLElement, text: string, x: number, y: number, cls = ''): void {
  const el = h('span', { class: `camp-float ${cls}`.trim(), text, style: `left:${x}px;top:${y}px` });
  layer.appendChild(el);
  const kill = () => el.remove();
  el.addEventListener('animationend', kill, { once: true });
  window.setTimeout(kill, 2000);
}

/** Radial spark burst at (x, y) inside `layer`. */
export function burst(layer: HTMLElement, x: number, y: number, color: string, count = 14, spread = 70): void {
  const wrap = h('span', { class: 'camp-burst', style: `left:${x}px;top:${y}px;--c:${color}` });
  wrap.appendChild(h('span', 'camp-burst-ring'));
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.55 + Math.random() * 0.6);
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 10;
    const size = 3 + Math.floor(Math.random() * 4);
    wrap.appendChild(
      h('span', {
        class: 'camp-burst-p',
        style: `--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;width:${size}px;height:${size}px;animation-delay:${Math.floor(Math.random() * 60)}ms`,
      }),
    );
  }
  layer.appendChild(wrap);
  window.setTimeout(() => wrap.remove(), 1100);
}

export function shake(el: Element): void {
  flashClass(el, 'camp-shake', 420);
}

export function pop(el: Element): void {
  flashClass(el, 'camp-pop', 520);
}
