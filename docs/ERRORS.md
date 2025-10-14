# ERROR / Edge cases

- `labels.length !== 32` → `RangeError("labels length must be 32")`
- `overrides`:
  - index が 0..31 外 → `Error("index out of range: X")`
  - label が存在しない → `Error("override label <name> not in labels")`
- 循環参照（serialize） → `TypeError("Cyclic object")`
- JSON にできない巨大入力 → **アプリ側**でサイズ制限推奨
