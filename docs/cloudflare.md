# Cloudflare Pages への公開

Jaspera はドメイン直下 `/` で動く静的サイトです。公開先は `https://jaspera.yamad.jp/` を予定しています。配信に Worker や Pages Functions は使いません。

## GitHub 連携

Cloudflare の Workers & Pages から Pages を作成し，GitHub の `JVMLand/Jaspera` を選びます。

| 項目                   | 設定                                      |
| ---------------------- | ----------------------------------------- |
| Production branch      | `main`                                    |
| Framework preset       | None                                      |
| Build command          | `bash scripts/build-pages.sh`             |
| Build output directory | `dist`                                    |
| Root directory         | リポジトリ直下（空欄）                    |
| Environment variables  | `NODE_VERSION=22`，`PNPM_VERSION=10.13.1` |

Pages の Git 連携がビルドと公開を行います。Deploy command や GitHub Actions 用の Cloudflare API トークンは不要です。ビルドスクリプトは JDK 23，CMake，Ninja を取得し，実行環境とサイトをビルドします。

まず `pages.dev` で実行・デバッグ・小窓・ファイル操作・オフライン利用を確認してください。その後，Pages の Custom domains から `jaspera.yamad.jp` を接続し，HTTPS で再確認します。

## ローカルで確認する

README に従って開発環境を用意し，初回は `pnpm install --frozen-lockfile` と `pnpm run setup` を実行します。

```sh
pnpm run build:pages
pnpm run preview:pages
```

確認先は Wrangler が表示するローカル URL の `/` です。通常は `http://localhost:8788/` です。`dist` がそのまま Pages の公開物になります。

## JDK の圧縮とキャッシュ

JDK の `modules` は約 28.35 MiB あり，Pages の 1 ファイル 25 MiB 制限を超えます。ビルド時に `modules.gzip`（約 9.42 MiB）を生成し，JVM が読み込む際にブラウザ内で展開します。元のファイルはローカルのテスト用に残し，公開物からは除外します。

この gzip はファイル自体の形式です。`Content-Encoding: gzip` は設定しません。JavaScript や CSS などの HTTP 圧縮は Pages に任せます。公開物のサイズとファイル数はビルド時に検査します。

Service Worker の対象範囲は `/` です。オフライン保存でも圧縮された JDK を保存し，同じ処理で展開します。`_headers` でハッシュ付きアセットの長期キャッシュと，実行環境・Service Worker の更新確認を設定します。存在しないファイルは `404.html` により 404 を返します。

- [Pages の制限](https://developers.cloudflare.com/pages/platform/limits/)
- [静的ファイルの配信](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [ヘッダー設定](https://developers.cloudflare.com/pages/configuration/headers/)

## 旧 Worker からの切り替え

この構成への変更だけでは，公開中の Worker やルートは変わりません。旧 Worker 向けのデプロイスクリプトと GitHub Actions の公開ワークフローは削除しています。

新サイトの確認後，LangJAL 側に旧 `/jaspera` からの永久リダイレクトを配置し，旧 Worker のルートを解除します。旧 URL からの転送を確認するまでは Worker 自体を残してください。旧構成は Git の `2026.2` タグで参照できます。

ドメインが変わるため，ブラウザ内のプロジェクト・設定・フォルダーのアクセス権は自動では移りません。旧 Service Worker がキャッシュした画面を返す場合もあります。ルート解除前に，旧サイトでの移行案内と保存データの持ち出し方法を用意してください。
