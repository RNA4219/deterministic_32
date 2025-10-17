# CLI 仕様

```
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfc|none --json[=compact|pretty] --pretty]
```

- `<key>` が無い場合は **stdin** を読み取る。
- 出力は **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
  - `--json` を付けない場合は従来通り **compact JSON**。`--json=compact` で明示指定できる。
  - `--json` 単体でも compact JSON（1行1JSON）を維持する。
  - `--json=pretty` と `--pretty` は同じ整形結果になり、整形モードでは 1 レコードが複数行の JSON になる。
  - `--json` と `--pretty` を同時指定した場合も整形出力（インデント2、複数行 JSON）となる。
  - NDJSON (1 行 1 JSON オブジェクト) になるのは compact/既定モード（`--json` を指定しない / `--json` / `--json=compact`）のみ。
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
