# CLI 仕様

```sh
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfkd|nfd|nfc|none --json[=compact|pretty] --pretty --help]
```

- `<key>` が無い場合は **stdin** を読み取る。
  - 標準入力から取得した文字列の末尾にある `\r?\n` は既定で除去され、CLI 引数として同じ内容を渡した場合と同一のキーが得られる。
  - 末尾改行を保持したままキーを生成する設定は現状提供していない。改行の有無で差分を扱いたい場合は、入力段階で明示的にエスケープ文字やプレースホルダーを用いるなどして区別する運用を検討してほしい。
- 出力は既定で **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
- `--json` を付けない場合と `--json` / `--json=compact` を指定した場合はいずれも compact JSON（1 行 1 JSON、末尾改行あり）の NDJSON を返す。
  NDJSON (1 行 1 JSON オブジェクト) になるのは compact/既定モードのみです。
  - `--json=pretty` / `--pretty` / `--json --pretty` は 2 スペースで整形した複数行の JSON を返し、NDJSON ではない。
- `--normalize` には Unicode 正規化モードとして `nfkc`（既定）、`nfkd`、`nfd`、`nfc`、`none` の 5 種類を指定できる。
- `--help` を指定するとヘルプテキストを表示して終了する。
- 終了コード:
- `0` … 成功
- `1` … その他の例外
- `2` … 循環/labels長不正/override不正など仕様違反。`RangeError`（未知フラグや許可外値など。例: `--json=invalid`）もこの終了コード。

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
```
