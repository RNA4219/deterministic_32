// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";

type SpawnOptions = {
  stdio?: ("pipe" | "inherit")[];
  env?: Record<string, string | undefined>;
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

  assert.equal(nanAssignment.key === nullAssignment.key, false);
  assert.equal(nanAssignment.hash === nullAssignment.hash, false);
});

test("Infinity serialized distinctly from string sentinel", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const infinityAssignment = c.assign({ value: Infinity });
  const sentinelAssignment = c.assign({ value: "__number__:Infinity" });

  assert.equal(infinityAssignment.key === sentinelAssignment.key, false);
  assert.equal(infinityAssignment.hash === sentinelAssignment.hash, false);
});

test("top-level bigint differs from number", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);
  assert.equal(bigintAssignment.key, "\u0000cat32:bigint:1\u0000");
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("top-level bigint canonical key uses bigint prefix", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);

  assert.equal(bigintAssignment.key, "\u0000cat32:bigint:1\u0000");
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("bigint sentinel string differs from bigint value", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const stringAssignment = c.assign("__bigint__:1");

  assert.ok(bigintAssignment.key !== stringAssignment.key);
  assert.ok(bigintAssignment.hash !== stringAssignment.hash);
});

test("undefined sentinel string differs from undefined value", () => {
  const c = new Cat32();
  const undefinedAssignment = c.assign(undefined);
  const stringAssignment = c.assign("__undefined__");

  assert.ok(undefinedAssignment.key !== stringAssignment.key);
  assert.ok(undefinedAssignment.hash !== stringAssignment.hash);
});

test("sparse arrays differ from empty arrays", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const sparseAssignment = c.assign({ value: new Array(1) });
  const emptyAssignment = c.assign({ value: [] });

  assert.ok(sparseAssignment.key !== emptyAssignment.key);
  assert.ok(sparseAssignment.hash !== emptyAssignment.hash);
});

test("top-level sparse arrays differ from empty arrays", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const sparseAssignment = c.assign(new Array(1));
  const emptyAssignment = c.assign([]);

  assert.ok(sparseAssignment.key !== emptyAssignment.key);
  assert.ok(sparseAssignment.hash !== emptyAssignment.hash);
});

test("sentinel strings differ from actual values at top level", () => {
  const c = new Cat32();

  const bigintValue = c.assign(1n);
  const bigintSentinel = c.assign("__bigint__:1");
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign(undefined);
  const undefinedSentinel = c.assign("__undefined__");
  assert.ok(undefinedValue.key !== undefinedSentinel.key);
  assert.ok(undefinedValue.hash !== undefinedSentinel.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign(date);
  const dateSentinel = c.assign("__date__:" + date.toISOString());
  assert.ok(dateValue.key !== dateSentinel.key);
  assert.ok(dateValue.hash !== dateSentinel.hash);
});

test("sentinel strings differ from actual values when nested", () => {
  const c = new Cat32();

  const bigintValue = c.assign({ value: 1n });
  const bigintSentinel = c.assign({ value: "__bigint__:1" });
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign({ value: undefined });
  const undefinedSentinel = c.assign({ value: "__undefined__" });
  assert.ok(undefinedValue.key !== undefinedSentinel.key);
  assert.ok(undefinedValue.hash !== undefinedSentinel.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign({ value: date });
  const dateSentinel = c.assign({ value: "__date__:" + date.toISOString() });
  assert.ok(dateValue.key !== dateSentinel.key);
  assert.ok(dateValue.hash !== dateSentinel.hash);
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

test("set differs from array with same entries", () => {
  const c = new Cat32();
  const setAssignment = c.assign(new Set([1, 2]));
  const arrayAssignment = c.assign([1, 2]);

  assert.ok(setAssignment.key !== arrayAssignment.key);
  assert.ok(setAssignment.hash !== arrayAssignment.hash);
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

test("CLI assign handles sets deterministically", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const script = [
    "(async () => {",
    "  const cliPath = process.argv.at(-1);",
    "  const { pathToFileURL } = await import('node:url');",
    "  const { Cat32 } = await import(new URL('../src/categorizer.js', pathToFileURL(cliPath)));",
    "  const magic = process.env.CAT32_MAGIC;",
    "  const values = JSON.parse(process.env.CAT32_SET_VALUES);",
    "  const originalAssign = Cat32.prototype.assign;",
    "  Cat32.prototype.assign = function(input) {",
    "    if (input === magic) {",
    "      const set = new Set();",
    "      for (const value of values) set.add(value);",
    "      return originalAssign.call(this, set);",
    "    }",
    "    return originalAssign.call(this, input);",
    "  };",
    "  process.stdin.isTTY = true;",
    "  process.argv = [process.argv[0], cliPath, magic];",
    "  try {",
    "    await import(cliPath);",
    "  } catch (error) {",
    "    console.error(error);",
    "    process.exit(1);",
    "  }",
    "})();",
  ].join("\n");

  const runWithValues = async (values: string[]) => {
    const baseEnv = (process as unknown as {
      env?: Record<string, string | undefined>;
    }).env ?? {};

    const child = spawn(process.argv[0], ["-e", script, CLI_PATH], {
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...baseEnv,
        CAT32_MAGIC: "__cat32_test_magic__",
        CAT32_SET_VALUES: JSON.stringify(values),
      },
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

    return JSON.parse(stdout);
  };

  const first = await runWithValues(["alpha", "beta", "gamma"]);
  const second = await runWithValues(["gamma", "beta", "alpha"]);

  assert.equal(first.key, second.key);
  assert.equal(first.hash, second.hash);
});

test("CLI command cat32 \"\" exits successfully", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, ""], {
    stdio: ["pipe", "pipe", "inherit"],
  });

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

test("CLI exits with code 2 for invalid normalize option using stdin", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--normalize=invalid"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });

  assert.equal(exitCode, 2);
});

test("CLI exits with code 2 for invalid normalize option", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "foo", "--normalize=invalid"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.end();

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });

  assert.equal(exitCode, 2);
});
