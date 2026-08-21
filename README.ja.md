# popn-score-tool

[English](README.md) | 日本語

(Translated from English)

pop'n music の e-amusement サイトからスコアをクライアントサイドで取得し、自己完結したオフライン HTML ビューワーとして書き出すブックマークレットです。

**対応バージョン：** [Jam&amp;Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) と [High Cheers!!](https://p.eagate.573.jp/game/popn/popn29/index.html)。ブックマークレットはログイン中のバージョンを自動判別します。

## 機能

- **スコア取得** — レベル別（Lv 1〜50）に全譜面のスコア・メダル・ランクを取得
- **ポップンクラス** — High Cheers では現行の公式算出式（新曲 Top 20 + 旧曲 Top 40、旧曲は `mu_detail.html` から取得した現バージョンスコアで算出）を計算し、ステータスページから取得した公式値と並べて表示します。レガシー方式の Top 50 計算も参考値として残しています（Jam&Fizz では従来どおりレガシー計算がメインです）。
- **High Cheers の追加要素** — でっかポップ君 / LIGHT 譜面は `mu_top.html` から取得し、実験的データとして表示します（LIGHT は EASY を置き換えるためレガシーの `easy` スロットにマップ、でっかポップ君はレベル情報がないためスコアブラウザでのみ参照可能）。
- **HTML エクスポート** — 自己完結したオフラインビューワーをダウンロード：
  - ポップンクラスサマリーカード（公式値 + 新算出式の計算値 + レガシー値）、新曲 Top 20 / 旧曲 Top 40 の内訳表、「EASYクリアの歴代メダルを参照」トグル
  - 並び替え・絞り込み対応のスコアブラウザ（スマホではカード表示）
  - レベル別クリアランプ統計
  - レベル別ランク統計（新ランク B+ / A+ / AA+ 対応）
  - ダークモード（システム設定に追従、手動切り替えも可能）
- **画像エクスポート** — 共有用 PNG を出力（High Cheers は新曲 Top 20 + 旧曲 Top 40、Jam&Fizz はレガシー Top 50）

## 使い方

### クイックインストール

**[インストールページ](https://navi0105.github.io/Popn-Score-Tool/)** にアクセスし、ボタンをブックマークバーへドラッグするだけです。

### 実行

1. お使いのバージョンの e-amusement playdata ページにログイン（[Jam&amp;Fizz](https://p.eagate.573.jp/game/popn/jamfizz/index.html) または [High Cheers](https://p.eagate.573.jp/game/popn/popn29/index.html)） — ベーシックコース必須
2. ブックマークバーの **Pop'n Score Tool** をクリック — UI に検出されたバージョンが表示されます
3. **Scrape** をクリックしてスコア取得を開始
4. 完了後、**View Results** でオフラインビューワーを開く、または **Export Image** で共有用 PNG を取得

### 手動インストール

ホスト型ローダーを使用しない場合：

1. `node build-bookmarklet.js` を実行（またはビルド済みの `bookmarklet.min.txt` をそのまま使用）
2. `bookmarklet.min.txt` の内容をコピー
3. ブラウザで新規ブックマークを作成し、URL 欄に貼り付け

## ファイル構成

| ファイル                    | 説明                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `bookmarklet.js`          | ブックマークレット本体のソース                                                     |
| `viewer-template.html`    | HTML ビューワーテンプレート（ビルド時にブックマークレットへ埋め込み）              |
| `build-bookmarklet.js`    | ビルドスクリプト：ブックマークレットを minify し、ビューワーテンプレートを埋め込む |
| `build-viewer.js`         | 開発用ツール：ローカルテスト向けに JSON データをビューワーテンプレートに埋め込む   |
| `docs/index.html`         | GitHub Pages のインストールページ                                                  |
| `docs/bookmarklet.min.js` | ホスト型ブックマークレットが読み込むビルド済み JS（自動生成）                      |

## 既知の制限事項

### High Cheers のポップンクラス算出式

本ツールはコミュニティで解明された High Cheers の算出式（[ssdh233/popn-class](https://github.com/ssdh233/popn-class) 参照）を実装しています。譜面ごとに、スコア 50000 以上のとき `floor(floor(level × (3750 × level + メダルボーナス + (score − 50000)) / 3881250, 小数8桁) × 60, 小数2桁)` を計算し、**新曲 Top 20 + 旧曲 Top 40** の合計を 60 で割った値がポップンクラスです。残る注意点：

- **旧曲は現バージョンのスコア**で算出する必要があり、これは `mu_detail.html` にしか表示されません。スクレイパーは候補譜面をポイント順に取得し、Top 40 が数学的に確定した時点で打ち切ります（追加リクエストは通常 40〜80 回程度）。途中で Stop した場合は *partial* と表示されます。
- 現バージョンのメダルは（VERSION 表にメダル画像がないため）**クリア/FC/PERFECT 回数から推定**します。細かいメダル段階（◆/★）はゲーム内部と異なる場合がありますが、ボーナス段階が変わる稀なケース以外は結果に影響しません。
- 対象はレベルが付いた **NORMAL/HYPER/EX** 譜面です — LIGHT とでっかポップ君は算出式の対象外（参照実装と同じ扱い）です。
- 丸め境界のケースや公式値の更新タイミングにより、計算値と公式値がわずかに乖離する場合があります。

## ライセンス

MIT

## 謝辞

1. [iidx.me](https://iidx.me)：エレガントな IIDX スコアトラッカーとクライアントサイドでスコアを取得するアプローチが、本ツールの大きなインスピレーションになりました
2. [ssdh233/popn-class](https://github.com/ssdh233/popn-class)：本ツールが再現している High Cheers ポップンクラス算出式のリファレンス実装
3. [Claude Code](https://claude.ai/claude-code)
