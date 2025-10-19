# CLI 仕様

```
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfkd|nfc|none --json[=compact|pretty] --pretty]
```

- `<key>` が無い場合は **stdin** を読み取る。
- 出力は既定で **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
  - `--json` を付けない場合、`--json` または `--json=compact` を指定した場合はいずれも compact JSON（1 行 1 JSON、末尾改行あり）の NDJSON を返す。NDJSON を選べるのはこの既定/compact モードのみ。
- `--json=pretty` / `--pretty` / `--json --pretty` は 2 スペースで整形した複数行の JSON を返し、各レコードが複数行になるため NDJSON ではない。
- 整形モードでは 1 レコードが複数行の JSON になるため、compact/既定モードとは出力の構造が異なる。
- NDJSON (1 行 1 JSON オブジェクト) になるのは compact/既定モードのみ。
- `--normalize` には Unicode 正規化モードとして `nfkc`（既定）、`nfkd`、`nfc`、`none` の 4 種類を指定できる。
- 終了コード:
- `0` … 成功
- `2` … 循環/labels長不正/override不正など仕様違反
  - `1` … その他の例外

## 出力例

```sh
$ cat32 foo
{"index":7,"label":"H","hash":"1a2b3c4d","key":"foo"}

$ cat32 --json foo
{"index":7,"label":"H","hash":"1a2b3c4d","key":"foo"}

$ cat32 --json=pretty foo
※ 以下の整形モード例は 1 件のレコードが複数行に展開される。
{
  "index": 7,
  "label": "H",
  "hash": "1a2b3c4d",
  "key": "foo"
}

$ cat32 --pretty foo
{
  "index": 7,
  "label": "H",
  "hash": "1a2b3c4d",
  "key": "foo"
}

$ cat32 --json --pretty foo
{
  "index": 7,
  "label": "H",
  "hash": "1a2b3c4d",
  "key": "foo"
}
```
