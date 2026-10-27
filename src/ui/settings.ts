// Settings modal: sound, display, save export/import/reset. Changes apply immediately.
import { exportSave, importSave } from '../core/save.ts';
import type { SaveData, Settings } from '../core/types.ts';
import type { IAudio } from '../audio/api.ts';
import { h } from './dom.ts';
import type { ModalHandle, Modals } from './modal.ts';
import type { ToastKind } from './toast.ts';

export interface SettingsHost {
  modals: Modals;
  audio: IAudio;
  getSave(): SaveData;
  /** Push save.settings to audio/renderer and persist. */
  applySettings(): void;
  /** Replace the whole save (import). */
  replaceSave(save: SaveData): void;
  /** Delete the save and return to the title screen. */
  resetSave(): void;
  toast(text: string, kind?: ToastKind): void;
}

function toggle(label: string, get: () => boolean, set: (v: boolean) => void, host: SettingsHost): HTMLElement {
  const btn = h('button', { class: 'toggle', attrs: { role: 'switch' } }, h('span', { class: 'toggle-knob' }), h('span', { class: 'toggle-text' }));
  const sync = () => {
    const on = get();
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.classList.toggle('on', on);
    btn.querySelector('.toggle-text')!.textContent = on ? 'ON' : 'OFF';
  };
  btn.addEventListener('click', () => {
    set(!get());
    sync();
    host.applySettings();
  });
  sync();
  return h('div', { class: 'set-row' }, h('span', { class: 'set-label', text: label }), btn);
}

function slider(label: string, get: () => number, set: (v: number) => void, host: SettingsHost, enabled: () => boolean): { row: HTMLElement; sync: () => void } {
  const input = h('input', { class: 'range', type: 'range', attrs: { min: '0', max: '100', step: '5', 'aria-label': label } });
  const val = h('span', { class: 'set-val' });
  const sync = () => {
    const v = Math.round(get() * 100);
    input.value = String(v);
    input.style.setProperty('--v', `${v}%`);
    val.textContent = `${v}%`;
    input.disabled = !enabled();
  };
  input.addEventListener('input', () => {
    set(Number(input.value) / 100);
    sync();
    host.applySettings();
  });
  input.addEventListener('change', () => host.audio.play('uiClick'));
  sync();
  return { row: h('div', { class: 'set-row' }, h('span', { class: 'set-label sub', text: label }), input, val), sync };
}

export function openSettings(host: SettingsHost): ModalHandle {
  const st = (): Settings => host.getSave().settings;

  const sfxVol = slider('効果音の音量', () => st().sfxVolume, (v) => (st().sfxVolume = v), host, () => st().sfx);
  const musicVol = slider('BGMの音量', () => st().musicVolume, (v) => (st().musicVolume = v), host, () => st().music);
  const sfxToggle = toggle('効果音', () => st().sfx, (v) => {
    st().sfx = v;
    sfxVol.sync();
  }, host);
  const musicToggle = toggle('BGM', () => st().music, (v) => {
    st().music = v;
    musicVol.sync();
  }, host);

  // ── data
  const exportArea = h('textarea', { class: 'code-area', attrs: { readonly: 'true', rows: '3', spellcheck: 'false', 'aria-label': 'エクスポートコード' } });
  const exportBtn = h('button', { class: 'btn small', text: 'コードを作成してコピー' });
  exportBtn.addEventListener('click', async () => {
    const code = exportSave(host.getSave());
    exportArea.value = code;
    exportArea.focus();
    exportArea.select();
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    host.toast(ok ? 'セーブコードをコピーした' : 'セーブコードを作成した（手動でコピーしてください）', 'good');
  });
  const importArea = h('textarea', { class: 'code-area', attrs: { rows: '3', spellcheck: 'false', placeholder: 'ここにセーブコードを貼り付け', 'aria-label': 'インポートコード' } });
  const importBtn = h('button', { class: 'btn small', text: '読み込む' });
  importBtn.addEventListener('click', async () => {
    const code = importArea.value.trim();
    if (!code) {
      host.toast('セーブコードを貼り付けてください', 'warn');
      return;
    }
    const data = importSave(code);
    if (!data) {
      host.audio.play('uiError');
      host.toast('セーブコードが正しくありません', 'warn');
      return;
    }
    const ok = await host.modals.confirm({ title: 'セーブを読み込む', body: '現在の進行状況は、読み込んだデータで上書きされます。よろしいですか？', ok: '上書きして読み込む', danger: true });
    if (!ok) return;
    m.close();
    host.replaceSave(data);
  });
  const resetBtn = h('button', { class: 'btn small danger', text: 'セーブデータを削除' });
  resetBtn.addEventListener('click', async () => {
    const a = await host.modals.confirm({ title: 'セーブデータを削除', body: 'すべての進行状況が失われます。削除しますか？', ok: '削除する', danger: true });
    if (!a) return;
    const b = await host.modals.confirm({ title: '本当に削除しますか？', body: 'この操作は取り消せません。レベル・スキルツリー・記録がすべて消えます。', ok: '完全に削除する', danger: true });
    if (!b) return;
    m.close();
    host.resetSave();
  });

  const closeBtn = h('button', { class: 'btn primary', text: '閉じる' });
  const content = h(
    'div',
    { class: 'settings' },
    h('h2', { class: 'modal-title', text: '設定' }),
    h('section', { class: 'set-section' }, h('h3', { class: 'set-h', text: 'サウンド' }), sfxToggle, sfxVol.row, musicToggle, musicVol.row),
    h(
      'section',
      { class: 'set-section' },
      h('h3', { class: 'set-h', text: '表示' }),
      toggle('画面の揺れ', () => st().screenShake, (v) => (st().screenShake = v), host),
      toggle('ダメージ数値', () => st().damageNumbers, (v) => (st().damageNumbers = v), host),
    ),
    h(
      'section',
      { class: 'set-section' },
      h('h3', { class: 'set-h', text: 'セーブデータ' }),
      h('p', { class: 'set-note', text: '進行状況は自動でブラウザに保存される。別の端末へ移すときはコードを使おう。' }),
      h('div', { class: 'set-data' }, h('div', { class: 'set-data-col' }, h('div', { class: 'set-label sub', text: 'エクスポート' }), exportArea, exportBtn), h('div', { class: 'set-data-col' }, h('div', { class: 'set-label sub', text: 'インポート' }), importArea, importBtn)),
      h('div', { class: 'set-danger' }, resetBtn),
    ),
    h('div', { class: 'set-keys' }, h('span', { text: '操作：' }), h('span', { class: 'key-badge', text: '1-4' }), h('span', { text: 'スキル' }), h('span', { class: 'key-badge', text: 'Space' }), h('span', { text: 'Overdrive' }), h('span', { class: 'key-badge', text: 'Esc' }), h('span', { text: 'ポーズ' }), h('span', { text: '／ 敵をクリックでMark' })),
    h('div', { class: 'modal-actions' }, closeBtn),
  );
  const m = host.modals.open(content, { className: 'modal-settings', label: '設定', focus: closeBtn });
  closeBtn.addEventListener('click', () => m.close());
  return m;
}
