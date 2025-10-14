// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";

type SpawnOptions = {
  stdio?: ("pipe" | "inherit")[];
};

type SpawnedProcess = {
  stdin: {
    write(chunk: string): void;
    end(): void;
  };
  stdout: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
  };
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
};

type SpawnFunction = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => SpawnedProcess;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const CLI_PATH = new URL("../src/cli.js", import.meta.url).pathname;

test("deterministic mapping for object key order", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const a1 = c.assign({ id: 123, tags: ["a", "b"] });
  const a2 = c.assign({ tags: ["a", "b"], id: 123 });
  assert.equal(a1.index, a2.index);
  assert.equal(a1.label, a2.label);
  assert.equal(a1.hash, a2.hash);
});

test("deterministic mapping for bigint values", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const source = { id: 1n, nested: { value: 2n } };
  const a1 = c.assign(source);
  const a2 = c.assign({ nested: { value: 2n }, id: 1n });
  assert.equal(a1.index, a2.index);
  assert.equal(a1.label, a2.label);
  assert.equal(a1.hash, a2.hash);
});

test("override by index", () => {
  const c = new Cat32({ overrides: { "hello": 7 } });
  const a = c.assign("hello");
  assert.equal(a.index, 7);
});

test("override by label", () => {
  const labels = Array.from({ length: 32 }, (_, i) => `L${i}`);
  const c = new Cat32({ labels, overrides: { "pin": "L31" } });
  const a = c.assign("pin");
  assert.equal(a.index, 31);
  assert.equal(a.label, "L31");
});

test("range 0..31 and various types", () => {
  const c = new Cat32();
  for (const k of ["a", "b", "c", "日本語", "ＡＢＣ", 123, true, null]) {
    const idx = c.index(k as any);
    assert.ok(idx >= 0 && idx <= 31);
  }
});

test("normalization NFKC merges fullwidth", () => {
  const c = new Cat32({ normalize: "nfkc" });
  const x = c.assign("Ａ"); // fullwidth A
  const y = c.assign("A");
  assert.equal(x.index, y.index);
});

test("unsupported normalization option throws", () => {
  assert.throws(
    () => new Cat32({ normalize: "nfkd" as any }),
    (error) => error instanceof RangeError,
  );
});

test("bigint values serialize deterministically", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const input = {
    value: 123n,
    nested: { arr: [1n, { deep: 2n }] },
  } as const;

  const first = c.assign(input);
  const second = c.assign({
    nested: { arr: [1n, { deep: 2n }] },
    value: 123n,
  });

  assert.equal(first.index, second.index);
  assert.equal(first.label, second.label);
  assert.equal(first.hash, second.hash);
});

test("NaN serialized distinctly from null", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const nanAssignment = c.assign({ value: NaN });
  const nullAssignment = c.assign({ value: null });

  assert.ok(nanAssignment.key !== nullAssignment.key);
  assert.ok(nanAssignment.hash !== nullAssignment.hash);
});

test("Infinity serialized distinctly from string sentinel", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const infinityAssignment = c.assign({ value: Infinity });
  const sentinelAssignment = c.assign({ value: "__number__:Infinity" });

  assert.ok(infinityAssignment.key !== sentinelAssignment.key);
  assert.ok(infinityAssignment.hash !== sentinelAssignment.hash);
});

test("top-level bigint differs from number", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);
  assert.equal(bigintAssignment.key, "__bigint__:1");
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("top-level bigint canonical key uses bigint prefix", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);

  assert.equal(bigintAssignment.key, "__bigint__:1");
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("cyclic object throws", () => {
  const a: any = { x: 1 };
  a.self = a;
  const c = new Cat32();
  assert.throws(() => c.assign(a), /Cyclic object/);
});

test("map object key differs from same-name string key", () => {
  const c = new Cat32();
  const objectKey = { foo: 1 };
  const stringKey = String(objectKey);
  const inputWithObjectKey = {
    payload: new Map<unknown, string>([
      [objectKey, "object"],
      [stringKey, "string"],
    ]),
  };
  const inputWithStringKey = {
    payload: new Map<unknown, string>([
      [stringKey, "object"],
      [objectKey, "string"],
    ]),
  };
  const a = c.assign(inputWithObjectKey);
  const b = c.assign(inputWithStringKey);
  assert.ok(a.key !== b.key);
});

test("map differs from plain object with same entries", () => {
  const c = new Cat32();
  const mapInput = {
    payload: new Map<unknown, unknown>([
      [1, "one"],
      [2, "two"],
    ]),
  };
  const objectInput = {
    payload: {
      1: "one",
      2: "two",
    },
  };

  const mapAssignment = c.assign(mapInput);
  const objectAssignment = c.assign(objectInput);

  assert.ok(mapAssignment.key !== objectAssignment.key);
  assert.ok(mapAssignment.hash !== objectAssignment.hash);
});

test("CLI preserves leading whitespace from stdin", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.write("  spaced\n");
  child.stdin.end();

  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });
  assert.equal(exitCode, 0);

  const result = JSON.parse(stdout);
  assert.equal(result.key, "  spaced");

  const expected = new Cat32().assign("  spaced");
  assert.equal(result.hash, expected.hash);
});

test("CLI handles empty string key from argv", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const script = [
    "const path = process.argv.at(-1);",
    "process.stdin.isTTY = true;",
    'process.argv = [process.argv[0], path, ""];',
    "import(path).catch((err) => { console.error(err); process.exit(1); });",
  ].join(" ");
  const child = spawn(process.argv[0], ["-e", script, CLI_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.end();

  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });
  assert.equal(exitCode, 0);

  const result = JSON.parse(stdout);
  assert.equal(result.key, "");

  const expected = new Cat32().assign("");
  assert.equal(result.hash, expected.hash);
});
