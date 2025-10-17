# CLI 仕様

```
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfc|none --json[=compact|pretty] --pretty]
```

- `<key>` が無い場合は **stdin** を読み取る。
- 出力は **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
- `--json` を付けない場合は従来通り **compact JSON**。`--json=compact` で明示指定でき、`--json=pretty` または `--pretty` でインデント付き JSON を得られる。
- 終了コード:
  - `0` … 成功
  - `2` … 循環/labels長不正/override不正など仕様違反
  - `1` … その他の例外
