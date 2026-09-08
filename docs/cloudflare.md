# Cloudflare への公開

`jal.yamad.jp` の既存サイトは GitHub Pages で配信し，`/jaspera` と `/jaspera/*` だけを Cloudflare Worker に振り分けます。公開パスは `https://jal.yamad.jp/jaspera/` です。

## DNS とルート

1. `yamad.jp` を管理する Cloudflare アカウントで，`jal.yamad.jp` の DNS レコードを確認します。
2. レコードの接続先は GitHub Pages のままにして，プロキシを有効（オレンジの雲）にします。GitHub Pages 側のカスタムドメイン設定も維持します。
3. 下記の手順で Worker をデプロイします。`wrangler.jsonc` の設定により，`jal.yamad.jp/jaspera` と `jal.yamad.jp/jaspera/*` の Route が登録されます。

`jal.yamad.jp` 全体を Worker の Custom Domain に登録する必要はありません。`/` など，指定したパス以外は従来どおり GitHub Pages に届きます。`/jaspera` は `/jaspera/` に転送します。

Route には Cloudflare でプロキシされた DNS レコードが必要です。現在の DNS が Cloudflare 管理でない場合は，先にその設定が必要になります。既存の DNS レコードを削除したり，GitHub Pages の接続先を Worker に置き換えたりしないでください。

- [Cloudflare の Route](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Custom Domain との違い](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## ローカルから公開する

README の開発環境を用意し，初回は `pnpm install --frozen-lockfile` と `pnpm run setup` を実行します。

```sh
pnpm run build:cloudflare
pnpm exec wrangler deploy --dry-run
pnpm run preview:cloudflare
```

ローカルの確認先は `http://localhost:8787/jaspera/` です。確認後，Cloudflare にログインして公開します。

```sh
pnpm exec wrangler login
pnpm run deploy:cloudflare
```

変更を公開するたびに `build:cloudflare` を実行してください。`deploy:cloudflare` は直前に生成した成果物をアップロードします。

## Cloudflare の Git 連携で自動公開する

Workers & Pages の Create application → Continue with GitHub で `JVMLand/Jaspera` を選択します。

| 項目              | 設定                                      |
| ----------------- | ----------------------------------------- |
| Project name      | `jaspera`                                 |
| Production branch | `main`                                    |
| Build command     | `bash scripts/build-cloudflare.sh`        |
| Deploy command    | `pnpm run deploy:cloudflare`              |
| Path              | `/`                                       |
| Build variable    | `NODE_VERSION=22`，`PNPM_VERSION=10.13.1` |

ビルドスクリプトは JDK 23，CMake，Ninja を取得し，JVM のビルドと圧縮まで実行します。Cloudflare の標準環境に Java があることは前提にしていません。GitHub Actions 用の secrets や，手元の Wrangler ログインは不要です。

連携後は `main` への push が自動公開のきっかけになります。本番以外のブランチのビルドは，必要になってから有効にしてください。

## GitHub Actions から手動公開する（別の方法）

リポジトリの Actions secrets に次の値を登録します。

| 名前                    | 値                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | `yamad.jp` を管理するアカウントの ID                                                                                   |
| `CLOUDFLARE_API_TOKEN`  | 対象アカウントの Workers Scripts の編集と，`yamad.jp` の Workers Routes の編集・Zone の読み取りを許可した API トークン |

Actions の **Deploy Jaspera to Cloudflare** を開き，**Run workflow** で公開するブランチを選びます。自動公開やリリースタグの作成は行いません。実行環境のビルドも含むため，初回は時間がかかります。

## 圧縮配信

128 KiB 以上のファイルはビルド時に Brotli（品質 11）と gzip を生成します。Worker はブラウザの対応形式に合わせて選びます。どちらも受け取れないクライアントには，gzip をストリーム展開して返します。

元の URL と展開後の内容は変わりません。小窓やオフライン保存でも同じファイルを利用します。圧縮済みファイルは `.cache/cloudflare/` に保存し，同じ内容なら次回ビルドで再利用します。過去のファイルはアップロード対象から除外します。

今回のビルドでは，全ファイル合計が約 65.1 MiB から 33.6 MiB になりました。これは全体を取得した場合の値で，初回表示時の通信量ではありません。特に JVM の `modules` は約 28.35 MiB から 6.61 MiB に縮小します。

Cloudflare Static Assets の 1 ファイル 25 MiB 制限に収まることを，Brotli・gzip の両方についてビルド時に確認します。圧縮形式の選択は Worker で行うため，このパスへのアクセスは Workers のリクエスト枠を使います。

`/jaspera/` のみを対象とする Service Worker を配信します。ただし，既存の GitHub サイトにも `/` を対象とする Service Worker がある場合は，そちらが `/jaspera/` を横取りしないよう，既存サイト側の設定も確認してください。

クローラー向けの指定はドメイン直下の `/robots.txt` が対象です。既存の GitHub サイト側で `/jaspera/` を禁止していないことを確認してください。
