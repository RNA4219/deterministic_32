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
2. Produce canonical keys with either `stableStringify(value)` (pure value transformation)
   or `cat.assign(value).key` (round-trips through normalization).
3. Use those canonical keys inside the `overrides` map to pin indexes or labels.

## CLI


`cat32` は `deterministic-32` パッケージに同梱された CLI バイナリアイアスで、`npx deterministic-32` と同等に利用できます。`npm install` 済みのプロジェクトでは `node_modules/.bin/cat32`（例: npm-scripts からの呼び出し）、`npm install -g deterministic-32` 後はグローバルに常駐した `cat32` コマンドをそのまま利用できます。パッケージを導入していない環境からリモート実行したい場合は、`npx --package deterministic-32 cat32` のように `--package` で一時取得してください。[^cat32-alias]
`npx cat32` で即時実行することも可能です。  
ローカルインストール後は `node_modules/.bin/cat32`（例: npm-scripts からの呼び出し）を利用でき、  
`npm install -g deterministic-32` 後はグローバルに常駐した `cat32` コマンドをそのまま使えます。  
未導入環境で一時的に遠隔実行したい場合は `npx --package deterministic-32 cat32` のようにその場で取得して呼び出してください。  
詳しくは [CLI ドキュメント](docs/CLI.md) を参照してください。[^cat32-alias]


```bash
npx deterministic-32 "user:123" --salt=proj --namespace=v1
echo '{"id":1,"k":"v"}' | npx deterministic-32 --salt=proj
# Output: one JSON per line (same shape as assign())
```
- フラグ解析を止めたい場合は `--`（ダブルダッシュ）を挟む。例えば `cat32 -- --literal-key`[^cat32-alias] は `--literal-key` をそのままキーとして処理する。
  `--` より後ろのトークンは空白区切りのまま 1 つの入力として結合され、`parseArgs()` はそれ以上フラグとして解釈しない。
  詳細は [docs/CLI.md](./docs/CLI.md) を参照してください。
- `echo` などからの標準入力は、実装上 `readStdin()` が末尾の `\r?\n` を既定で取り除くため、
  CLI 引数で渡した場合と同じ canonical key に揃います。
  現状 CLI からこの振る舞いを切り替える方法はなく、将来的に保持が必要になった場合は `readStdin` の `preserveTrailingNewline` オプションを公開するフラグ追加で対応予定です。
- 利用可能なフラグ:
  - `--salt <value>`: Salt to apply when assigning a category.
  - `--namespace <value>`: Namespace that scopes generated categories.
  - `--normalize <value>`: Unicode normalization form (`none`/`nfc`/`nfd`/`nfkc`/`nfkd`; default: `nfkc`).
  - `--json [format]`: Output JSON format: `compact` or `pretty` (default: `compact`).
    `--json=<value>` 形式で許可されていない値を指定した場合は `RangeError` で終了します。
    スペース区切りで許可外の値を渡した場合に限り `compact` へフォールバックし、後続トークン（存在する場合）は位置引数としてキーに回されます。
  - `--pretty`: Shorthand for `--json pretty`.
  - `--help`: Show this help message and exit.
- 出力は既定で 1 行 1 JSON の **NDJSON**（末尾改行あり）。
  NDJSON はデフォルト/compact モードのみで利用できます。
  `--json` を付けない場合と `--json` / `--json=compact` を指定した場合はいずれもこの形式になります。
- `--json=pretty` / `--pretty` / `--json --pretty` は複数行の整形 JSON（インデント 2）を返します。
  各レコードが複数行になるため NDJSON ではありません。

例（`cat32`[^cat32-alias] は `npx cat32` で即時実行するか、ローカル/グローバルインストールで取得したバイナリを PATH に通して利用します）:

```bash
cat32 --json foo
# -> {"key":"\"foo\"",...} を含む NDJSON 1 レコードを出力し、成功終了します。
#    スペース区切りで許可外の値を渡しているため `--json` は compact にフォールバックし、`foo` は後続トークンとしてキーに扱われます。
#    一方 `--json=foo` のように `=` 付きで許可外の値を渡すと `RangeError` で終了します。
```

[^cat32-alias]: `cat32` は `deterministic-32` に同梱された CLI エイリアスです。`npx cat32`、ローカルインストール後の `node_modules/.bin/cat32`、`npm install -g deterministic-32` 後のグローバル `cat32` いずれからも起動できます。未導入環境では `npx --package deterministic-32 cat32` などの一時取得コマンドからも実行可能です。


## Determinism
- Canonical key = **normalize(NFKC)** ∘ **stable stringify (key-sorted, cycle-check)**.
- Hash = **FNV-1a 32-bit** over UTF-8 bytes.
- Index = `hash & 31` (0..31).  
Changing `labels/salt/namespace/normalize` changes results intentionally.

## Notes
- Not cryptographic. Do **not** use for secrecy or collision-critical workloads.
- For compatibility flips, bump `namespace` (consumer side).
- Overrides compare against **post-normalized keys**.
- Birdseye map refresh: when touching `src/categorizer.ts` or `src/serialize.ts`, run
  `codemap.update --targets src/categorizer.ts src/serialize.ts --emit index+caps` before merge;
  if `generated_at` drifts, regenerate both `index.json` and the matching capsules and commit them together.

## Benchmark
- `npm run bench` (build + `node dist/scripts/bench.js`).
- 成果: 300k keys/sec 目標を達成（CI 環境: Node 18, x86_64 コンテナ）。
- スループットが閾値を下回ると非ゼロ終了コードで失敗するため、劣化を検知可能。

## License
MIT
