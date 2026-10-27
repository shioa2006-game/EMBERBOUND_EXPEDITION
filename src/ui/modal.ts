// Stacked modal dialogs + confirm(). The app shell routes keyboard input to the top modal.
import { h } from './dom.ts';

export interface ModalOptions {
  className?: string;
  /** Esc / backdrop click closes the modal (default true). */
  closable?: boolean;
  /** Backdrop click closes (default = closable). */
  backdropClose?: boolean;
  onClose?: () => void;
  /** Return true if the key was handled. Called before the default Esc handling. */
  onKey?: (e: KeyboardEvent) => boolean;
  /** Element to focus after opening. */
  focus?: HTMLElement | null;
  /** Accessible label. */
  label?: string;
}

export interface ModalHandle {
  readonly panel: HTMLElement;
  readonly layer: HTMLElement;
  close(): void;
  readonly closed: boolean;
}

interface Entry {
  handle: ModalHandle;
  opts: ModalOptions;
  prevFocus: Element | null;
}

export interface ConfirmOptions {
  title: string;
  body?: string | HTMLElement;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

export class Modals {
  private root: HTMLElement;
  private stack: Entry[] = [];
  /** Called whenever the stack changes (pause logic, etc.). */
  onChange: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  isOpen(): boolean {
    return this.stack.length > 0;
  }

  count(): number {
    return this.stack.length;
  }

  open(content: HTMLElement, opts: ModalOptions = {}): ModalHandle {
    const closable = opts.closable ?? true;
    const backdrop = h('div', { class: 'modal-backdrop' });
    const panel = h('div', { class: `modal ${opts.className ?? ''}`.trim(), attrs: { role: 'dialog', 'aria-modal': 'true', tabindex: '-1' } }, content);
    if (opts.label) panel.setAttribute('aria-label', opts.label);
    const layer = h('div', { class: 'modal-layer' }, backdrop, panel);
    let closed = false;
    const handle: ModalHandle = {
      panel,
      layer,
      get closed() {
        return closed;
      },
      close: () => {
        if (closed) return;
        closed = true;
        const i = this.stack.findIndex((e) => e.handle === handle);
        const entry = i >= 0 ? this.stack.splice(i, 1)[0] : null;
        layer.classList.add('out');
        window.setTimeout(() => layer.remove(), 180);
        opts.onClose?.();
        const pf = entry?.prevFocus as HTMLElement | null;
        if (pf && typeof pf.focus === 'function' && document.contains(pf)) pf.focus({ preventScroll: true });
        this.onChange?.();
      },
    };
    if (closable && (opts.backdropClose ?? true)) backdrop.addEventListener('click', () => handle.close());
    this.stack.push({ handle, opts: { ...opts, closable }, prevFocus: document.activeElement });
    this.root.appendChild(layer);
    requestAnimationFrame(() => {
      layer.classList.add('in');
      (opts.focus ?? panel).focus({ preventScroll: true });
    });
    this.onChange?.();
    return handle;
  }

  /** Route a keydown to the top modal. Returns true when a modal is open (input is captured). */
  handleKey(e: KeyboardEvent): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    if (top.opts.onKey && top.opts.onKey(e)) {
      e.preventDefault();
      return true;
    }
    if (e.key === 'Escape' && top.opts.closable) {
      e.preventDefault();
      top.handle.close();
    }
    return true;
  }

  closeAll(): void {
    for (const e of [...this.stack].reverse()) e.handle.close();
  }

  confirm(o: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let result = false;
      const okBtn = h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, text: o.ok ?? 'OK' });
      const cancelBtn = h('button', { class: 'btn', text: o.cancel ?? 'キャンセル' });
      const body = typeof o.body === 'string' ? h('p', { class: 'confirm-body', text: o.body }) : (o.body ?? null);
      const content = h(
        'div',
        { class: 'confirm' },
        h('h2', { class: 'modal-title', text: o.title }),
        body,
        h('div', { class: 'modal-actions' }, cancelBtn, okBtn),
      );
      const m = this.open(content, {
        className: `modal-confirm ${o.danger ? 'is-danger' : ''}`,
        onClose: () => resolve(result),
        focus: o.danger ? cancelBtn : okBtn,
        label: o.title,
      });
      okBtn.addEventListener('click', () => {
        result = true;
        m.close();
      });
      cancelBtn.addEventListener('click', () => m.close());
    });
  }
}
