# TEST VECTORS

本ベクタは **NFKC 正規化** + FNV‑1a 32bit + `index = hash & 31` の参照値。

## Unsalted

| input | normalized | salted_key | hash_hex | index |
|---|---|---|---|---|
| `` | `""` | `""` | `ffcaaa85` | 5 |
| `A` | `"A"` | `"A"` | `e1f0b84a` | 10 |
| `Ａ` | `"A"` | `"A"` | `e1f0b84a` | 10 |
| `Á` | `"Á"` | `"Á"` | `7d754c91` | 17 |
| `Á` | `"Á"` | `"Á"` | `7d754c91` | 17 |
| `日本語` | `"日本語"` | `"日本語"` | `5b2850bf` | 31 |
| `hello` | `"hello"` | `"hello"` | `df47ee8b` | 11 |
| `hello world` | `"hello world"` | `"hello world"` | `8158ae3f` | 31 |
| `123` | `"123"` | `"123"` | `ac58341b` | 27 |
| `true` | `"true"` | `"true"` | `4f9ddea5` | 5 |
| `null` | `"null"` | `"null"` | `1fc7c652` | 18 |
| `user:123` | `"user:123"` | `"user:123"` | `6577056e` | 14 |
| `task:register` | `"task:register"` | `"task:register"` | `9676581b` | 27 |

## Salted (salt=projX, namespace=v1)

| input | normalized | salted_key | hash_hex | index |
|---|---|---|---|---|
| `` | `""` | `""|saltns:["projX","v1"]` | `bc802308` | 8 |
| `A` | `"A"` | `"A"|saltns:["projX","v1"]` | `f4b2bd6f` | 15 |
| `Ａ` | `"A"` | `"A"|saltns:["projX","v1"]` | `f4b2bd6f` | 15 |
| `Á` | `"Á"` | `"Á"|saltns:["projX","v1"]` | `e2325e24` | 4 |
| `Á` | `"Á"` | `"Á"|saltns:["projX","v1"]` | `e2325e24` | 4 |
| `日本語` | `"日本語"` | `"日本語"|saltns:["projX","v1"]` | `319ef956` | 22 |
| `hello` | `"hello"` | `"hello"|saltns:["projX","v1"]` | `6d983fb2` | 18 |
| `hello world` | `"hello world"` | `"hello world"|saltns:["projX","v1"]` | `50dfcad6` | 22 |
| `123` | `"123"` | `"123"|saltns:["projX","v1"]` | `0ac6e002` | 2 |
| `true` | `"true"` | `"true"|saltns:["projX","v1"]` | `a4680368` | 8 |
| `null` | `"null"` | `"null"|saltns:["projX","v1"]` | `b0347117` | 23 |
| `user:123` | `"user:123"` | `"user:123"|saltns:["projX","v1"]` | `11d00f43` | 3 |
| `task:register` | `"task:register"` | `"task:register"|saltns:["projX","v1"]` | `d61ce402` | 2 |

### Canonicalization example (objects)

Input objects:
```json
{"id": 123, "tags": ["a", "b"]}
```
and
```json
{"tags": ["a", "b"], "id": 123}
```

Canonical key (sorted keys, then NFKC):
```
{"id":123,"tags":["a","b"]}
```

FNV-1a32 over UTF-8 for salted key `{"id":123,"tags":["a","b"]}|saltns:["projX","v1"]`:
- hash = `dd3673d7`
- index = `23`

**Note:** Different key order → same canonical string → same hash/index.

### Sentinel examples (TypedArray / ArrayBuffer)

```
stableStringify(new Uint8Array([1, 2, 3]))
→ "\"\\u0000cat32:typedarray:kind=Uint8Array;byteOffset=0;byteLength=3;length=3;hex=010203\\u0000\""

stableStringify(new ArrayBuffer(2))
→ "\"\\u0000cat32:arraybuffer:byteLength=2;hex=0000\\u0000\""

// SharedArrayBuffer はランタイムがサポートしている場合に限り利用可能。
stableStringify(new SharedArrayBuffer(2))
→ "\"\\u0000cat32:sharedarraybuffer:byteLength=2;hex=0000\\u0000\""
```
