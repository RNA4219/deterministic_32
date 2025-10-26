# CLI 仕様

```sh
$ npx deterministic-32 <key?> \
    [--salt=... --namespace=... \
     --normalize=nfkc|nfkd|nfd|nfc|none \
     --json[=compact|pretty] --pretty --help]
```

以降の例で利用する `cat32` は `deterministic-32` パッケージに同梱された CLI バイナリアイアスで、ローカルインストール後の `node_modules/.bin/cat32`、`npm install -g deterministic-32` 後のグローバル `cat32` に加えて、未導入環境では `npx --package deterministic-32 cat32` のように一時取得して呼び出せます。[^cat32-alias]

- `<key>` が無い場合は **stdin** を読み取る。
  - 標準入力から取得した文字列の末尾にある `\r?\n` は既定で除去され、CLI 引数として同じ内容を渡した場合と同一のキーが得られる。
  - 末尾改行を保持したままキーを生成する設定は現状提供していない。改行の有無で差分を扱いたい場合は、入力段階で明示的にエスケープ文字やプレースホルダーを用いるなどして区別する運用を検討してほしい。
- キーが `-` から始まるなど、フラグとして解釈されたくない引数を渡すときは `--`（ダブルダッシュ）を使って CLI のフラグ解析を終了させる。
  例えば `cat32 -- --literal-key`[^cat32-alias] は `--literal-key` をそのままキーとして扱う。
  `--` 以降のトークンは空白区切りのまま 1 つの文字列へ結合され、`parseArgs()` でフラグ再解釈されずにリテラル引数として処理される。
- 出力は既定で **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
- `--json` を付けない場合と `--json` / `--json=compact` を指定した場合はいずれも compact JSON（1 行 1 JSON、末尾改行あり）の NDJSON を返す。NDJSON (1 行 1 JSON オブジェクト) になるのは compact/既定モードのみです。
  - CLI の `--json` オプションは以下の順序で値を解決する。
    1. `--json=pretty` のように `=` で指定された値を採用し、`compact` / `pretty` 以外なら `RangeError` を発生させる。
    2. スペース区切りの次トークンが `compact` または `pretty` の場合はそれを値として消費し、`--json pretty` のように扱う。
    3. 上記のどちらにも該当しなければ既定の `compact` へフォールバックし、そのトークンは位置引数として扱う。`cat32 --json foo` では `foo` が許可外のトークンなので、出力は compact のまま `foo` がキーとして受理される。
  - `--json=pretty` / `--pretty` / `--json --pretty` は 2 スペースで整形した複数行の JSON を返し、NDJSON ではない。
- `--normalize` には Unicode 正規化モードとして `nfkc`（既定）、`nfkd`、`nfd`、`nfc`、`none` の 5 種類を指定できる。
- `--help` を指定するとヘルプテキストを表示して終了する。
- 終了コード:
- `0` … 成功
- `1` … `RangeError` 以外の例外（内部エラーなど）
- `2` … 仕様違反を検出した場合。CLI の入力検証では `RangeError` で通知する（例: 未知のフラグ、許可外の `--json` 値、存在しない正規化モード指定）。`Cat32` 本体が循環参照や label の不正上書き、範囲外インデックスなどを検知したときも同様に終了コード 2 となる。詳細は [DESIGN.md §6](./DESIGN.md#6-cli-cli-ts) を参照。

## 出力例

```sh
$ cat32 foo
{"index":15,"label":"P","hash":"c6aac00f","key":"\"foo\""}

$ cat32 --json foo
{"index":15,"label":"P","hash":"c6aac00f","key":"\"foo\""}

$ cat32 --json=pretty foo
※ 以下の整形モード例は 1 件のレコードが複数行に展開される。
整形モードでは 1 レコードが複数行の JSON になるため、ストリーム処理では compact/既定モードを利用する。
{
  "index": 15,
  "label": "P",
  "hash": "c6aac00f",
  "key": "\"foo\""
}

$ cat32 --pretty foo
{
  "index": 15,
  "label": "P",
  "hash": "c6aac00f",
  "key": "\"foo\""
}

$ cat32 --json --pretty foo
{
  "index": 15,
  "label": "P",
  "hash": "c6aac00f",
  "key": "\"foo\""
}

$ cat32 -- --literal-key
{"index":12,"label":"M","hash":"b9f6cbe3","key":"\"--literal-key\""}
```

[^cat32-alias]: `cat32` は `deterministic-32` に同梱された CLI エイリアスです。ローカルインストール後の `node_modules/.bin/cat32`、`npm install -g deterministic-32` 後のグローバル `cat32` に加え、未導入環境では `npx --package deterministic-32 cat32` のような一時取得コマンドからも起動できます。
