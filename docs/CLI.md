# CLI 仕様

```
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfkd|nfc|none --json[=compact|pretty] --pretty]
```

- `<key>` が無い場合は **stdin** を読み取る。
- 出力は既定で **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
  - 既定（`--json` を指定しない）および `--json[=compact]` は compact JSON を 1 行 1 レコードで出力し、末尾改行付きの NDJSON を維持する。
  - `--json=pretty` と `--pretty` は同義で、インデント 2 の複数行 JSON を返す。`--json` と併用しても整形出力になり、NDJSON にはならない。
- 整形モードは複数行 JSON（非 NDJSON）となる点に注意。
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
