# deterministic-32

Deterministic **32-way** categorizer for JS/TS.  
Stable hashing (FNV-1a 32-bit), NFKC/NFC normalization, salt/namespace, label set, and rule overrides.  
Runs in Node (>=18) and browsers, **no dependencies**.

## Install
```bash
npm i deterministic-32
```

## Usage (Library)
```ts
import { Cat32 } from "deterministic-32";

const cat = new Cat32({
  salt: "projectX",
  namespace: "v1",
  // labels: Array(32).fill(0).map((_,i)=>`B${i}`),  // optional
  // overrides: { "vip-user": 0, "audited": "A" },   // pin by index or label
});

cat.index("ユーザーID:123");     // -> 0..31
cat.labelOf({ id: 1 });          // -> "A".."Z","0".."5"
cat.assign("hello");
// -> { index: 5, label: "F", hash: "a1b2c3d4", key: "<canonicalized>" }
```

## CLI
```bash
npx deterministic-32 "user:123" --salt=proj --namespace=v1
echo '{"id":1,"k":"v"}' | npx deterministic-32 --salt=proj
# Output: one JSON per line (same shape as assign())
```

## Determinism
- Canonical key = **normalize(NFKC)** ∘ **stable stringify (key-sorted, cycle-check)**.
- Hash = **FNV-1a 32-bit** over UTF-8 bytes.
- Index = `hash & 31` (0..31).  
Changing `labels/salt/namespace/normalize` changes results intentionally.

## Notes
- Not cryptographic. Do **not** use for secrecy or collision-critical workloads.
- For compatibility flips, bump `namespace` (consumer side).
- Overrides compare against **post-normalized keys**.

## License
MIT
