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
| `Space` | 野営地のどのタブからでも出発／戦闘中はOverdrive（Rekindle後） |
| `R` | リザルトで「もう一度出発」（戦闘中のSpaceと分離） |
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
| `tests/browser/ui-layout.html` | 1920×1080・1920×950・1440×900・1280×720・1024×600、序盤／全員加入後の野営地と帰還結果を検証。場面の表示寸法、1280×720以上で遠征・パーティがスクロールなしで収まるか、全タブで出発ボタンが見えるかも計測。専用iframe内の実寸表示領域で主要ボタンの収まり・スクロール時の位置・通知や購入前後の安定性を計測（メモリ内のテストデータのみ使用） |

Studioからの再取り込みは `node scripts/sync-storybook-vendor.mjs`。描画APIと装備差分はゲーム側で管理しています。制限されたWindows環境でVitestの一時ファイルが開けない場合は `npm test -- --pool=threads` で実行できます。

変更前のソース一式は、作業端末のローカルバックアップ `backups/pre-storybook-20261027.zip` に保存しています（Git管理対象外）。確認画像は `docs/art/storybook-review/` にあります。

野営地は幅900px以上で2列です。左列に野営地の場面・パーティの状態・出発ボタン（全タブ共通、Spaceでも出発）を置き、右列のタブ（遠征／パーティ／スキルツリー／レリック）だけがスクロールします。スキルツリーでは左列を畳み、出発ボタンをタブの行へ移します。幅900px未満では場面を上部の帯、出発ボタンを下部のバーにした1列表示です。戦闘HUDは戦闘画面の左右の端に揃えています。帰還結果も操作欄を固定し、通知は内容に重ならない専用領域へ表示します。UIのサイズ別確認画像と30場面の検証結果は `docs/art/ui-review/` に保存しています。

プレイテスト後の改善では、設定・新エリア・転生・エンディングの操作欄も固定しました。パーティと戦闘中の技能説明は現在の強化を反映し、レリック満杯時はカードから交換できます。戦闘画面の「一時停止（Esc）」から停止でき、結果画面の再出発は `R` です。

`tests/browser/ui-layout.html` の「全サイズを検証」で、1920×1080・1920×950・1440×900・1280×720・1024×600の表示と購入・交換・入力を確認できます。検証画面はメモリ上の専用セーブを使い、プレイヤーの保存データを読み書きしません。

2026-10-28の検証は75ケースすべて成功。結果と主要5画面×3サイズの画像は `docs/art/ui-playtest-review/` に保存しています。配布用ビルドでも既存セーブ再開、一時停止、撤退、結果でSpaceが再出発しないこと、Rで再出発できることを確認しました。
