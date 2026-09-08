# 性能の定点測定

`npm run build` の後に `npm run perf` を実行する。専用のブラウザーと localhost:5235 の preview サーバーを起動し，終了時に閉じる。開発用の5173番ポートは使用しない。

起動，Hello World の初回実行，PrintStream の定義を開く時間，初回グラフ，グラフを10回開き直した時間，命令補完を測る。結果は `.cache/performance/latest.json` に記録する。ビルドのコミット，ブラウザー，端末情報も記録される。

比較する場合は結果を別名で残し，`PERF_BASELINE` に以前のJSONのパスを指定する。`PERF_OUTPUT` で出力先を変更できる。比率が1を超えると以前より遅い。同じ端末・ブラウザー・ビルド条件で複数回実行して比較する。普遍的な合否しきい値は設けていない。

メモリはGC後のページのJavaScriptヒープ，バッキングストレージ，DOM数，Worker数を記録する。JVM/WASM Workerを含むアプリ全体のRAM使用量ではない。閉じた文書がページ側に蓄積していないかを見るための指標として使う。`deviceMemory` は端末容量の粗い目安であり，空きRAMではない。

標準ライブラリの解析は `node --test tests/jdk-roundtrip.test.mjs`，メソッド単位の回復は `node --test tests/partial-analysis.test.mjs`，描画範囲の制限は `node --test tests/graph-viewport-ui.test.mjs` で検証する。

## 基準値（2026-09-08）

Edge headless / Windows，本番ビルドを localhost で配信。ほかのビルド・テストを止めて測定した。会場の回線速度を再現した測定ではない。

| 操作                                 |    時間 |
| ------------------------------------ | ------: |
| 初回アクセスから実行可能になるまで   |  3.97秒 |
| Hello World 初回実行                 |  2.75秒 |
| PrintStream の定義を開く             |  4.16秒 |
| PrintStream の初回グラフ             | 26.50秒 |
| 同じグラフの開き直し（10回の中央値） | 0.452秒 |
| 命令補完                             | 0.229秒 |

PrintStream 全1,322命令に対し，この表示範囲で生成したSVGノードは172個。メソッドの配置情報は保持している。

GC後のページのJavaScriptヒープは，グラフ初回表示後19.6 MiB，10回の開き直し後21.2 MiB。DOM数は3,650→3,696，イベントリスナー数は1,042→1,042だった。この結果だけで長時間利用時のリークがないとは断定できない。JVM/WASM WorkerのRAMはこの数値に含まれない。

生データ: [performance-workspace-baseline.json](performance-workspace-baseline.json)。以後はこのファイルを `PERF_BASELINE` に指定して比較できる。
