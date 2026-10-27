# EMBERBOUND EXPEDITION

消えかけた聖なる炎「Ember」をランタンに宿し、闇の底へ何度も挑む **短編インクリメンタルRPG / パーティオートバトラー**。
倒れても持ち帰った Gold と Ember で強くなり、さっきまで勝てなかった敵を圧倒する —— そのループを 60〜90 分で味わうブラウザゲームです。

- 初回クリア（The Hollow Sovereign 撃破）: 約45〜55分
- 真エンディング（Rekindle 後の The Ember Heart）: 約60〜80分
- 手描きの絵本風アート。キャラクター・背景・音楽は同梱コードから生成し、ネット接続不要で動作します。

## 遊び方

| 操作 | 内容 |
|---|---|
| `1` `2` `3` `4` / スキルボタン | Shield Bash / Arrow Rain / Meteor / Sanctuary |
| 敵をクリック | Mark（集中攻撃・被ダメージ増加）※Ranger加入後 |
| `Space` | Overdrive（Rekindle後）／リザルトで「もう一度出発」 |
| `Enter` | リザルトで「強化する」／カードを閉じる |
| `Esc` | ポーズ |
| `Q` `E` / `←` `→` | 野営地のタブ切り替え |

- **オレンジのゲージ** = 溜め攻撃。Shield Bash で中断すると **BREAK**（大ダメージ＋被ダメージ2倍）。
- **紫のゲージ** = 中断不可の大技。Sanctuary の Barrier で受け止める。
- 状況に合ったタイミングでスキルを手動発動すると **PERFECT**（クールダウン40%回復）。
- 1回の遠征（Run）はランタンが尽きるか全滅で終了。獲得物はすべて持ち帰れる。
- Gold でヒーローのレベル、Ember でスキルツリー、Relic Shard で Relic を強化・解放。
- The Hollow Sovereign 撃破後は **Rekindle（転生）** で Relic・Overdrive・Descent（連続踏破）と最後の地が解放される。

## 起動方法

いちばん簡単なのは **`Play.bat` をダブルクリック** すること（ビルド済みの `dist/index.html` を既定のブラウザで開きます。未ビルドなら自動でビルドしてから開きます。要 Node.js）。

開発用に起動する場合:

```bash
npm install
```

```bash
npm run dev
```

ブラウザで表示された URL（既定は http://localhost:5173）を開きます。

配布用ビルド（単一の `dist/index.html`。ダブルクリックでオフライン起動可）:

```bash
npm run build
```

## GitHub Pagesへの公開

公開URL: https://shioa2006-game.github.io/EMBERBOUND_EXPEDITION/

GitHubの **Settings → Pages → Build and deployment → Source** は **GitHub Actions** に設定します。`main` へのプッシュ時に `.github/workflows/pages.yml` が Node.js 24 で `npm ci`、テスト、ビルドを実行し、生成した `dist/` のみを公開します。Actionsから手動実行もできます。

リポジトリ直下の `index.html` はVite開発用で、TypeScriptソースを参照します。ブランチのルートをそのまま公開するとゲームが起動しません。公開にはビルド後の `dist/index.html` を使用してください。ビルド成果物をGitにコミットする必要はありません。

## 開発・検証

| コマンド | 内容 |
|---|---|
| `npm test` | Vitest（435件: セーブ、経済、スキルツリー、戦闘、周回、全編セルフプレイ） |
| `npm run typecheck` | TypeScript 型チェック |
| `npm run sim` | 自動プレイBotで全編を通しプレイし、進行タイムラインを表示 |
| `node scripts/report.ts --camp=30` | 複数シード×プレイヤー像（casual/expert/noskill）のバランス表 |
| `node scripts/sprite-preview.ts` | 旧ピクセル版のスプライト・背景プレビュー（比較資料） |

URL に `?debug` を付けると `window.__eb`（通貨付与・エリア解放・`advance(秒)` によるフレーム手動送り など）が使えます。

## 構成

```
src/core     DOMに依存しない戦闘シミュレーション・進行・セーブ（Nodeでもそのまま動く）
src/data     ヒーロー・敵・エリア・スキルツリー・Relic のデータ
src/render   高解像度Canvas描画（手描きキャラ・背景、エフェクト、ダメージ数値、戦利品演出）
src/audio    Web Audio による効果音とチップチューンBGM
src/ui       画面遷移・HUD・リザルト・チュートリアル・野営地（パーティ/スキルツリー/Relic）
scripts      セルフプレイBot・バランスレポート・スプライトプレビュー
tests        Vitest
docs         DESIGN.md（企画）/ MECHANICS.md（実装仕様）/ BALANCE.md（調整記録）/ art/
```

技術: TypeScript + Vite + Canvas 2D + Web Audio。ランタイム依存ライブラリなし。文字にはOS標準の明朝体・セリフ体を使用。

## 絵本風アート（2026年10月27日）

`src/render/storybook/` が現在の描画素材です。Studioの44種を `vendor/` に複製し、肌・髪と造形を保って味方の装備を6段階に調整しています。元のStudioフォルダーは変更していません。戦闘・成長・セーブの処理は従来のままです。

- `characters.ts`: 必要なコマを4倍解像度の透明画像へ切り出し、64MiB上限のキャッシュで再利用。エリアと装備に応じて非同期に事前生成します。攻撃・詠唱・被弾・戦闘不能は素材に設定された時間とコマ割りに従います。
- `scenes.ts`: 暗い森・水没神殿・晶洞・霜の城塞・虚無・炎の心臓、野営地、タイトルの手描き背景。遠近スクロールと環境粒子を含みます。
- `icons.ts` / `surface.ts`: 手描きアイコンと、高解像度画像を従来のゲーム座標へ描く共通処理。
- `src/styles/storybook.css`: 絵本・古書風のUI。文字、カード、ボタン、状態表示を統一。

開発サーバーで以下の確認ページを開けます（検査用データを使い、ゲームのセーブには書き込みません）。

| ページ | 内容 |
|---|---|
| `tests/browser/storybook-characters.html` | 44種・64外見、味方の左右を含む4,202コマの描画・余白・アンカー検査と一覧 |
| `tests/browser/storybook-battle.html` | 6エリアのボス戦、スキル、状態異常、撃破・戦闘不能の統合検査 |
| `scripts/storybook-scenes-preview.html` | 全背景の構図・スクロール・接地を比較 |

Studioからの再取り込みは `node scripts/sync-storybook-vendor.mjs`。描画APIと装備差分はゲーム側で管理しています。制限されたWindows環境でVitestの一時ファイルが開けない場合は `npm test -- --pool=threads` で実行できます。

変更前のソース一式は、作業端末のローカルバックアップ `backups/pre-storybook-20261027.zip` に保存しています（Git管理対象外）。確認画像は `docs/art/storybook-review/` にあります。
