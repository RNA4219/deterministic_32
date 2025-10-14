# TEST VECTORS

本ベクタは **NFKC 正規化** + FNV‑1a 32bit + `index = hash & 31` の参照値。

## Unsalted

| input | normalized | salted_key | hash_hex | index |
|---|---|---|---|---|
| `` | `` | `` | `811c9dc5` | 5 |
| `A` | `A` | `A` | `c40bf6cc` | 12 |
| `Ａ` | `A` | `A` | `c40bf6cc` | 12 |
| `Á` | `Á` | `Á` | `369e0e89` | 9 |
| `Á` | `Á` | `Á` | `369e0e89` | 9 |
| `日本語` | `日本語` | `日本語` | `805f5ce7` | 7 |
| `hello` | `hello` | `hello` | `4f9f2cab` | 11 |
| `hello world` | `hello world` | `hello world` | `d58b3fa7` | 7 |
| `123` | `123` | `123` | `7238631b` | 27 |
| `true` | `true` | `true` | `4db211e5` | 5 |
| `null` | `null` | `null` | `77074ba4` | 4 |
| `user:123` | `user:123` | `user:123` | `a07519d8` | 24 |
| `task:register` | `task:register` | `task:register` | `a97e531b` | 27 |

## Salted (salt=projX, namespace=v1)

| input | normalized | salted_key | hash_hex | index |
|---|---|---|---|---|
| `` | `` | `|salt:projX|ns:v1` | `7d980b06` | 6 |
| `A` | `A` | `A|salt:projX|ns:v1` | `25c62c09` | 9 |
| `Ａ` | `A` | `A|salt:projX|ns:v1` | `25c62c09` | 9 |
| `Á` | `Á` | `Á|salt:projX|ns:v1` | `832d894a` | 10 |
| `Á` | `Á` | `Á|salt:projX|ns:v1` | `832d894a` | 10 |
| `日本語` | `日本語` | `日本語|salt:projX|ns:v1` | `aa885700` | 0 |
| `hello` | `hello` | `hello|salt:projX|ns:v1` | `93097734` | 20 |
| `hello world` | `hello world` | `hello world|salt:projX|ns:v1` | `a5390740` | 0 |
| `123` | `123` | `123|salt:projX|ns:v1` | `78332e04` | 4 |
| `true` | `true` | `true|salt:projX|ns:v1` | `670b26e6` | 6 |
| `null` | `null` | `null|salt:projX|ns:v1` | `7503eba1` | 1 |
| `user:123` | `user:123` | `user:123|salt:projX|ns:v1` | `38281e15` | 21 |
| `task:register` | `task:register` | `task:register|salt:projX|ns:v1` | `cb1ffe04` | 4 |

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

FNV-1a32 over UTF-8 for salted key `{"id":123,"tags":["a","b"]}|salt:projX|ns:v1`:
- hash = `dd3673d7`
- index = `23`

**Note:** Different key order → same canonical string → same hash/index.
