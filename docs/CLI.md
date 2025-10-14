# CLI 仕様

```
$ npx deterministic-32 <key?> [--salt=... --namespace=... --normalize=nfkc|nfc|none]
```

- `<key>` が無い場合は **stdin** を読み取る。
- 出力は **1行1JSON (NDJSON)**：
  ```json
  {"index":7,"label":"H","hash":"1a2b3c4d","key":"...canonical..."}
  ```
- 終了コード:
  - `0` … 成功
  - `2` … 循環/labels長不正/override不正など仕様違反
  - `1` … その他の例外
