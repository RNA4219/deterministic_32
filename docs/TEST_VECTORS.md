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
| `` | `""` | `""|salt:projX|ns:v1` | `713b5146` | 6 |
| `A` | `"A"` | `"A"|salt:projX|ns:v1` | `69cb9a27` | 7 |
| `Ａ` | `"A"` | `"A"|salt:projX|ns:v1` | `69cb9a27` | 7 |
| `Á` | `"Á"` | `"Á"|salt:projX|ns:v1` | `f18c95f2` | 18 |
| `Á` | `"Á"` | `"Á"|salt:projX|ns:v1` | `f18c95f2` | 18 |
| `日本語` | `"日本語"` | `"日本語"|salt:projX|ns:v1` | `b8941818` | 24 |
| `hello` | `"hello"` | `"hello"|salt:projX|ns:v1` | `31f95254` | 20 |
| `hello world` | `"hello world"` | `"hello world"|salt:projX|ns:v1` | `fba46898` | 24 |
| `123` | `"123"` | `"123"|salt:projX|ns:v1` | `3c4ff104` | 4 |
| `true` | `"true"` | `"true"|salt:projX|ns:v1` | `38d58126` | 6 |
| `null` | `"null"` | `"null"|salt:projX|ns:v1` | `232b692f` | 15 |
| `user:123` | `"user:123"` | `"user:123"|salt:projX|ns:v1` | `0cfe3e2b` | 11 |
| `task:register` | `"task:register"` | `"task:register"|salt:projX|ns:v1` | `85c59d04` | 4 |

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
