// Small stacked toast notifications (bottom-center, above the HUD).
import { h } from './dom.ts';

export type ToastKind = 'info' | 'good' | 'warn';

const MAX_TOASTS = 4;

export class Toasts {
  private root: HTMLElement;
  private last = '';
  private lastAt = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(text: string, kind: ToastKind = 'info', ms = 2800): void {
    const now = performance.now();
    // de-duplicate rapid repeats (e.g. key mashing)
    if (text === this.last && now - this.lastAt < 900) return;
    this.last = text;
    this.lastAt = now;
    const el = h('div', { class: `toast toast-${kind}`, attrs: { role: 'status' } }, h('span', { class: 'toast-pip' }), h('span', { class: 'toast-text', text }));
    this.root.appendChild(el);
    while (this.root.children.length > MAX_TOASTS) this.root.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    window.setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 320);
    }, ms);
  }
}
