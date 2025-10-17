# deterministic-32

<!-- guardrails:yaml
forbidden_paths:
  - "/core/schema/**"
  - "/auth/**"
require_human_approval:
  - "/governance/**"
slo:
  lead_time_p95_hours: 72
  mttr_p95_minutes: 60
  change_failure_rate_max: 0.10
-->

<!-- LLM-BOOTSTRAP v1 -->
読む順番:
1. docs/birdseye/index.json  …… ノード一覧・隣接関係（軽量）
2. docs/birdseye/caps/<path>.json …… 必要ノードだけ point read（個別カプセル）

フォーカス手順:
- 直近変更ファイル±2hopのノードIDを index.json から取得
- 対応する caps/*.json のみ読み込み
<!-- /LLM-BOOTSTRAP -->

Deterministic **32-way** categorizer for JS/TS.
Stable hashing (FNV-1a 32-bit), NFKC/NFC normalization, salt/namespace, label set, and rule overrides.  
Runs in Node (>=18) and browsers, **no dependencies**.

## Install
```bash
npm i deterministic-32
```

## Usage (Library)
```ts
import { Cat32, stableStringify } from "deterministic-32";

const overrides = {
  [stableStringify("vip-user")]: 0,              // canonical key via stable stringify
  [stableStringify({ id: "audited" })]: "A",    // canonical key via stable stringify
};

const cat = new Cat32({
  salt: "projectX",
  namespace: "v1",
  // labels: Array(32).fill(0).map((_, i) => `B${i}`),  // optional
  overrides,
});

cat.index("ユーザーID:123");     // -> 0..31
cat.labelOf({ id: "audited" });  // -> "A" (override pinned by label)
const assignment = cat.assign("hello");
// -> { index: 5, label: "F", hash: "a1b2c3d4", key: "<canonicalized>" }
```

### Canonical override keys

1. Instantiate a `Cat32` instance with the normalization/salt/namespace you plan to ship.
2. Produce canonical keys with either `stableStringify(value)` (pure value transformation) or `cat.assign(value).key` (round-trips through normalization).
3. Use those canonical keys inside the `overrides` map to pin indexes or labels.

## CLI
```bash
npx deterministic-32 "user:123" --salt=proj --namespace=v1
echo '{"id":1,"k":"v"}' | npx deterministic-32 --salt=proj
# Output: one JSON per line (same shape as assign())
```
- `--json=compact` で既定形式を明示し、`--json=pretty` / `--pretty` / `--json --pretty` は複数行の整形 JSON (末尾改行あり) を返します。NDJSON はデフォルト/compact モードのみです。

## Determinism
- Canonical key = **normalize(NFKC)** ∘ **stable stringify (key-sorted, cycle-check)**.
- Hash = **FNV-1a 32-bit** over UTF-8 bytes.
- Index = `hash & 31` (0..31).  
Changing `labels/salt/namespace/normalize` changes results intentionally.

## Notes
- Not cryptographic. Do **not** use for secrecy or collision-critical workloads.
- For compatibility flips, bump `namespace` (consumer side).
- Overrides compare against **post-normalized keys**.
- Birdseye map refresh: when touching `src/categorizer.ts` or `src/serialize.ts`, run `codemap.update --targets src/categorizer.ts src/serialize.ts --emit index+caps` before merge; if `generated_at` drifts, regenerate both `index.json` and the matching capsules and commit them together.

## License
MIT
