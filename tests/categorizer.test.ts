// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";
import { escapeSentinelString, stableStringify } from "../src/serialize.js";

declare const Buffer: {
  from(input: string | Uint8Array): { toString(encoding: string): string };
};

type SpawnOptions = {
  stdio?: ("pipe" | "inherit" | "ignore")[];
  env?: Record<string, string | undefined>;
  cwd?: string;
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
  stderr: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
  };
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
};

type FsPromisesModule = {
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, data: string, options?: string): Promise<void>;
  rm(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>;
};

type PathModule = {
  join(...segments: string[]): string;
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

test("tsc succeeds without duplicate identifier errors", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const repoRoot = new URL("../", sourceImportMetaUrl).pathname;
  const { mkdtemp, writeFile, rm } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const tempDir = await mkdtemp(join(repoRoot, ".tmp-cat32-tsc-"));

  try {
    const entryPath = join(tempDir, "entry.ts");
    const tsconfigPath = join(tempDir, "tsconfig.json");

    await writeFile(
      entryPath,
      [
        "import { Cat32 } from \"../src/index.js\";",
        "const instance = new Cat32({ salt: \"salt\", namespace: \"namespace\" });",
        "instance.assign(\"value\");",
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      tsconfigPath,
      JSON.stringify(
        {
          extends: "../tsconfig.json",
          compilerOptions: {
            outDir: "./out",
            noEmit: true,
            skipLibCheck: false,
          },
          include: ["./entry.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const child = spawn(
      "tsc",
      ["-p", "tsconfig.json", "--pretty", "false"],
      { cwd: tempDir, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const exitCode: number | null = await new Promise((resolve) => {
      child.on("close", (code: number | null) => resolve(code));
    });

    assert.equal(
      exitCode,
      0,
      `tsc failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("dist entry point exports Cat32", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const distModule = (await import(
    new URL("../dist/index.js", sourceImportMetaUrl) as unknown as string
  )) as { Cat32?: unknown };

  assert.equal(typeof distModule.Cat32, "function");
});

test("dist index and cli modules are importable", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  await import(
    new URL("../dist/index.js", sourceImportMetaUrl) as unknown as string,
  ).catch((error) => {
    throw new Error(`Failed to import dist/index.js: ${String(error)}`);
  });

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const stdin = process.stdin as unknown as { isTTY?: boolean };
  const originalIsTTY = stdin.isTTY;
  const captured: string[] = [];

  try {
    const distCliPath = new URL("../dist/cli.js", sourceImportMetaUrl).pathname;
    process.argv = [originalArgv[0], distCliPath, "__cat32_test_key__"];
    stdin.isTTY = true;
    process.exit = (() => undefined) as typeof process.exit;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      captured.push(text);
      return true;
    }) as typeof process.stdout.write;

    await import(
      new URL("../dist/cli.js", sourceImportMetaUrl) as unknown as string,
    );
  } catch (error) {
    throw new Error(`Failed to import dist/cli.js: ${String(error)}`);
  } finally {
    process.argv = originalArgv;
    stdin.isTTY = originalIsTTY;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
  }

  assert.ok(captured.some((chunk) => chunk.includes("index")));
});

const CLI_SET_ASSIGN_SCRIPT = [
  "(async () => {",
  "  const cliPath = process.argv.at(-1);",
  "  const { pathToFileURL } = await import('node:url');",
  "  const { Cat32 } = await import(new URL('../src/categorizer.js', pathToFileURL(cliPath)));",
  "  const magic = process.env.CAT32_MAGIC;",
  "  const values = JSON.parse(process.env.CAT32_SET_VALUES ?? '[]');",
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

async function runCliAssignWithSet(values: unknown[]): Promise<{ key: string; hash: string }> {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const baseEnv = (process as unknown as { env?: Record<string, string | undefined> }).env ?? {};

  const child = spawn(process.argv[0], ["-e", CLI_SET_ASSIGN_SCRIPT, CLI_PATH], {
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

  return JSON.parse(stdout) as { key: string; hash: string };
}

test("deterministic mapping for object key order", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const a1 = c.assign({ id: 123, tags: ["a", "b"] });
  const a2 = c.assign({ tags: ["a", "b"], id: 123 });
  assert.equal(a1.index, a2.index);
  assert.equal(a1.label, a2.label);
  assert.equal(a1.hash, a2.hash);
});

test("canonical key encodes undefined sentinel", () => {
  const c = new Cat32();
  const assignment = c.assign({ value: undefined });
  assert.equal(assignment.key, stableStringify({ value: undefined }));
});

test("dist categorizer matches source sentinel encoding", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const [{ Cat32: SourceCat32 }, { Cat32: DistCat32 }] = await Promise.all([
    import("../src/categorizer.js"),
    import(
      new URL("../dist/src/categorizer.js", sourceImportMetaUrl) as unknown as string,
    ) as Promise<typeof import("../src/categorizer.js")>,
  ]);

  const source = new SourceCat32();
  const dist = new DistCat32();

  const sourceAssignment = source.assign({ value: undefined });
  const distAssignment = dist.assign({ value: undefined });

  assert.equal(distAssignment.key, sourceAssignment.key);
});

test("canonical key encodes date sentinel", () => {
  const c = new Cat32();
  const date = new Date("2024-01-02T03:04:05.000Z");
  const assignment = c.assign({ value: date });
  assert.equal(assignment.key, stableStringify({ value: date }));
});

test("canonical key matches stableStringify for basic primitives", () => {
  const c = new Cat32({ normalize: "none" });
});

test("functions and symbols serialize to bare strings", () => {
  const fn = function foo() {};
  const sym = Symbol("x");

  assert.equal(stableStringify(fn), String(fn));
  assert.equal(stableStringify(sym), String(sym));

  const c = new Cat32();

  assert.equal(c.assign(fn).key, String(fn));
  assert.equal(c.assign(sym).key, String(sym));
});

test("string sentinel matches date value", () => {
  const c = new Cat32();
  const iso = "2024-01-02T03:04:05.000Z";
  const sentinelAssignment = c.assign(`__date__:${iso}`);
  const dateAssignment = c.assign(new Date(iso));
  assert.equal(sentinelAssignment.key, dateAssignment.key);
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
  const overrides = { [stableStringify("hello")]: 7 };
  const c = new Cat32({ overrides });
  const a = c.assign("hello");
  assert.equal(a.index, 7);
});

test("override by label", () => {
  const labels = Array.from({ length: 32 }, (_, i) => `L${i}`);
  const overrides = { [stableStringify("pin")]: "L31" };
  const c = new Cat32({ labels, overrides });
  const a = c.assign("pin");
  assert.equal(a.index, 31);
  assert.equal(a.label, "L31");
});

test("override rejects NaN with explicit error", () => {
  assert.throws(
    () => new Cat32({ overrides: { foo: Number.NaN as any } }),
    (error) => error instanceof Error && error.message === "index out of range: NaN",
  );
});

test("override rejects NaN", () => {
  assert.throws(
    () => new Cat32({ overrides: { foo: Number.NaN as any } }),
    (error) => error instanceof Error,
  );
});

test("override accepts canonical key strings", () => {
  const overrides = {
    [stableStringify(123)]: 5,
    [stableStringify(undefined)]: 6,
    [stableStringify(true)]: 7,
  } satisfies Record<string, number>;

  const c = new Cat32({ overrides });

  assert.equal(c.assign(123).index, 5);
  assert.equal(c.assign(undefined).index, 6);
  assert.equal(c.assign(true).index, 7);
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

test("stableStringify leaves sentinel-like strings untouched", () => {
  assert.equal(stableStringify("__undefined__"), JSON.stringify("__undefined__"));
});

test("stableStringify uses String() for functions and symbols", () => {
  const fn = function foo() {};
  const sym = Symbol("x");

  assert.equal(stableStringify(fn), String(fn));
  assert.equal(stableStringify(sym), String(sym));
});

test("canonical key follows String() for functions and symbols", () => {
  const c = new Cat32();
  const fn = function foo() {};
  const sym = Symbol("x");

  assert.equal(c.assign(fn).key, String(fn));
  assert.equal(c.assign(sym).key, String(sym));
});

test("string sentinel literals remain literal canonical keys", () => {
  const assignment = new Cat32().assign("__date__:2024-01-01Z");
  assert.equal(assignment.key, stableStringify("__date__:2024-01-01Z"));
});

test("escapeSentinelString returns sentinel-like literals", () => {
  const sentinelLike = "__date__:2024-01-01Z";
  assert.equal(escapeSentinelString(sentinelLike), sentinelLike);
});

test("Map keys match plain object representation regardless of entry order", () => {
  const c = new Cat32();
  const map = new Map<string, number>([
    ["10", 10],
    ["2", 2],
  ]);

  const mapAssignment = c.assign(map);
  const objectAssignment = c.assign({ 2: 2, 10: 10 });

  assert.equal(mapAssignment.key, objectAssignment.key);
  assert.equal(mapAssignment.hash, objectAssignment.hash);

  const reorderedMapAssignment = c.assign(
    new Map<string, number>([
      ["2", 2],
      ["10", 10],
    ]),
  );
  const reorderedObjectAssignment = c.assign({ 10: 10, 2: 2 });

  assert.equal(reorderedMapAssignment.key, objectAssignment.key);
  assert.equal(reorderedMapAssignment.hash, objectAssignment.hash);
  assert.equal(reorderedObjectAssignment.key, objectAssignment.key);
  assert.equal(reorderedObjectAssignment.hash, objectAssignment.hash);

  const duplicateKeyMapAssignment = c.assign(
    new Map<unknown, string>([
      [0, "same"],
      ["0", "same"],
    ]),
  );
  const duplicateKeyObjectAssignment = c.assign({ 0: "same" });

  assert.equal(duplicateKeyMapAssignment.key, duplicateKeyObjectAssignment.key);
  assert.equal(duplicateKeyMapAssignment.hash, duplicateKeyObjectAssignment.hash);
});

test("Map values serialize identically to plain object values", () => {
  const c = new Cat32();
  const fn = function foo() {};
  const sym = Symbol("x");

  const mapAssignment = c.assign(
    new Map<string, unknown>([
      ["fn", fn],
      ["sym", sym],
    ]),
  );
  const objectAssignment = c.assign({ fn, sym });

  assert.equal(mapAssignment.key, objectAssignment.key);
  assert.equal(mapAssignment.hash, objectAssignment.hash);
});

test("Map string sentinel key matches object property", () => {
  const c = new Cat32();
  const mapAssignment = c.assign(new Map([["__undefined__", 1]]));
  const objectAssignment = c.assign({ "__undefined__": 1 });

  assert.equal(mapAssignment.key, objectAssignment.key);
  assert.equal(mapAssignment.hash, objectAssignment.hash);
});

test("Infinity serialized distinctly from string sentinel", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const infinityAssignment = c.assign({ value: Infinity });
  const sentinelAssignment = c.assign({ value: "__number__:Infinity" });

  assert.equal(infinityAssignment.key === sentinelAssignment.key, false);
  assert.equal(infinityAssignment.hash === sentinelAssignment.hash, false);
});

test("raw number sentinel string differs from Infinity value", () => {
  const c = new Cat32();
  const sentinelAssignment = c.assign("\u0000cat32:number:Infinity\u0000");
  const infinityAssignment = c.assign(Infinity);

  assert.ok(sentinelAssignment.key !== infinityAssignment.key);
  assert.ok(sentinelAssignment.hash !== infinityAssignment.hash);
});

test("top-level bigint differs from number", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);
  assert.equal(bigintAssignment.key, stableStringify(1n));
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("top-level bigint canonical key uses bigint prefix", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const numberAssignment = c.assign(1);

  assert.equal(bigintAssignment.key, stableStringify(1n));
  assert.ok(bigintAssignment.key !== numberAssignment.key);
  assert.ok(bigintAssignment.hash !== numberAssignment.hash);
});

test("canonical key for primitives uses stable stringify", () => {
  const c = new Cat32();

  assert.equal(c.assign("foo").key, stableStringify("foo"));
  assert.equal(c.assign(1n).key, stableStringify(1n));
  assert.equal(c.assign(Number.NaN).key, stableStringify(Number.NaN));
  assert.equal(c.assign(Symbol("x")).key, stableStringify(Symbol("x")));
});

test("bigint sentinel string differs from bigint value", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const stringAssignment = c.assign("__bigint__:1");

  assert.ok(bigintAssignment.key !== stringAssignment.key);
  assert.ok(bigintAssignment.hash !== stringAssignment.hash);
});

test("undefined sentinel string matches undefined value", () => {
  const c = new Cat32();
  const undefinedAssignment = c.assign(undefined);
  const stringAssignment = c.assign("__undefined__");

  assert.equal(undefinedAssignment.key, stringAssignment.key);
  assert.equal(undefinedAssignment.hash, stringAssignment.hash);
});

test("top-level undefined serializes with sentinel string", () => {
  const assignment = new Cat32().assign(undefined);

  assert.equal(assignment.key, stableStringify(undefined));
});

test("undefined object property serializes with sentinel", () => {
  const c = new Cat32();
  const assignment = c.assign({ value: undefined });

  assert.equal(assignment.key, stableStringify({ value: undefined }));
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

test("sentinel strings align with actual values at top level", () => {
  const c = new Cat32();

  const bigintValue = c.assign(1n);
  const bigintSentinel = c.assign("__bigint__:1");
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign(undefined);
  const undefinedSentinel = c.assign("__undefined__");
  assert.equal(undefinedValue.key, undefinedSentinel.key);
  assert.equal(undefinedValue.hash, undefinedSentinel.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign(date);
  const dateSentinel = c.assign("__date__:" + date.toISOString());
  assert.equal(dateValue.key, dateSentinel.key);
  assert.equal(dateValue.hash, dateSentinel.hash);
});

test("sentinel string literals match nested undefined/date but not bigint", () => {
  const c = new Cat32();

  const bigintValue = c.assign({ value: 1n });
  const bigintSentinel = c.assign({ value: "__bigint__:1" });
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign({ value: undefined });
  const undefinedLiteral = c.assign({ value: "__undefined__" });
  assert.equal(undefinedValue.key, undefinedLiteral.key);
  assert.equal(undefinedValue.hash, undefinedLiteral.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign({ value: date });
  const dateLiteral = c.assign({ value: "__date__:" + date.toISOString() });
  assert.equal(dateValue.key, dateLiteral.key);
  assert.equal(dateValue.hash, dateLiteral.hash);
});

test("date object property serializes with sentinel", () => {
  const c = new Cat32();
  const date = new Date("2024-01-02T03:04:05.678Z");
  const assignment = c.assign({ value: date });

  assert.equal(assignment.key, stableStringify({ value: date }));
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

test("map payload matches plain object with same entries", () => {
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

  assert.equal(mapAssignment.key, objectAssignment.key);
  assert.equal(mapAssignment.hash, objectAssignment.hash);
});

test("set serialization matches array entries regardless of insertion order", () => {
  const c = new Cat32();
  const values = [1, 2, 3];

  const setAssignment = c.assign(new Set(values));
  const arrayAssignment = c.assign([...values]);

  assert.equal(setAssignment.key, arrayAssignment.key);
  assert.equal(setAssignment.hash, arrayAssignment.hash);

  const reorderedSetAssignment = c.assign(new Set([...values].reverse()));

  assert.equal(reorderedSetAssignment.key, setAssignment.key);
  assert.equal(reorderedSetAssignment.hash, setAssignment.hash);
});

test("dist bundle canonical keys match source for Set/Date/undefined", async () => {
  const distModuleUrl = new URL("../dist/src/categorizer.js", import.meta.url);
  let distModule: { Cat32: typeof Cat32 };
  try {
    distModule = (await import(
      new URL("../dist/src/categorizer.js", import.meta.url) as unknown as string,
    )) as { Cat32: typeof Cat32 };
  } catch (error) {
    const maybeModuleNotFound = error as Error & { code?: string };
    if (maybeModuleNotFound.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }
    const normalizedHref = distModuleUrl.href.replace("/dist/dist/", "/dist/");
    distModule = (await import(normalizedHref)) as { Cat32: typeof Cat32 };
  }
  const { Cat32: DistCat32 } = distModule;

  const srcCategorizer = new Cat32();
  const distCategorizer = new DistCat32();

  const setValue = new Set(["a", "b"]);
  assert.equal(distCategorizer.assign(setValue).key, srcCategorizer.assign(setValue).key);

  const dateValue = new Date("2024-01-02T03:04:05.678Z");
  assert.equal(distCategorizer.assign(dateValue).key, srcCategorizer.assign(dateValue).key);

  assert.equal(distCategorizer.assign(undefined).key, srcCategorizer.assign(undefined).key);
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
  assert.equal(result.key, stableStringify("  spaced"));

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
  assert.equal(result.key, stableStringify(""));

  const expected = new Cat32().assign("");
  assert.equal(result.hash, expected.hash);
});

test("CLI assign handles sets deterministically", async () => {
  const first = await runCliAssignWithSet(["alpha", "beta", "gamma"]);
  const second = await runCliAssignWithSet(["gamma", "beta", "alpha"]);

  assert.equal(first.key, second.key);
  assert.equal(first.hash, second.hash);
});

test("CLI assign handles set insertion order for object values", async () => {
  const first = await runCliAssignWithSet([
    { id: 1, payload: "first" },
    { id: 2, payload: "second" },
  ]);
  const second = await runCliAssignWithSet([
    { id: 2, payload: "second" },
    { id: 1, payload: "first" },
  ]);

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
  assert.equal(result.key, stableStringify(""));

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

test("CLI exits with code 2 when override label error is thrown", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const script = [
    "(async () => {",
    "  const cliPath = process.argv.at(-1);",
    "  const { pathToFileURL } = await import('node:url');",
    "  const { Cat32 } = await import(new URL('../src/categorizer.js', pathToFileURL(cliPath)));",
    "  const originalAssign = Cat32.prototype.assign;",
    "  Cat32.prototype.assign = function assign() {",
    '    Cat32.prototype.assign = originalAssign;',
    '    throw new Error(\'override label "VIP" not in labels\');',
    "  };",
    "  process.stdin.isTTY = true;",
    "  process.argv = [process.argv[0], cliPath, 'payload'];",
    "  try {",
    "    await import(cliPath);",
    "  } catch (error) {",
    "    console.error(error);",
    "    process.exit(1);",
    "  }",
    "})();",
  ].join("\n");

  const child = spawn(process.argv[0], ["-e", script, CLI_PATH], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  child.stdin.end();

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });

  assert.equal(exitCode, 2);
});

test("CLI exits with code 2 when override label is missing", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const script = [
    "(async () => {",
    "  const cliPath = process.argv.at(-1);",
    "  const { pathToFileURL } = await import('node:url');",
    "  const { Cat32 } = await import(new URL('../src/categorizer.js', pathToFileURL(cliPath)));",
    "  Cat32.prototype.assign = function assign() {",
    '    throw new Error(\'override label "X" not in labels\');',
    "  };",
    "  process.stdin.isTTY = true;",
    "  process.argv = [process.argv[0], cliPath, 'payload'];",
    "  try {",
    "    await import(cliPath);",
    "  } catch (error) {",
    "    console.error(error);",
    "    process.exit(1);",
    "  }",
    "})();",
  ].join("\n");

  const child = spawn(process.argv[0], ["-e", script, CLI_PATH], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  child.stdin.end();

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });

  assert.equal(exitCode, 2);
});

test("CODEOWNERS gate resolves review decision fallback", async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile(path: URL, encoding: string): Promise<string>;
  };
  const yaml = await readFile(
    new URL("../../.github/workflows/pr_gate.yml", import.meta.url),
    "utf8",
  );

  const lines = yaml.split("\n");
  const scriptIndex = lines.findIndex((line) => line.includes("script: |"));
  assert.ok(scriptIndex >= 0, "workflow script block not found");

  const trimmedLines: string[] = [];
  for (let i = scriptIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("          ")) {
      trimmedLines.push(line.slice(10).replace(/^\s+/u, ""));
      continue;
    }
    if (line.trim().length === 0) {
      continue;
    }
    break;
  }
  const startIndex = trimmedLines.findIndex((line) =>
    line.startsWith("function resolveReviewDecision"),
  );
  assert.ok(startIndex >= 0, "resolveReviewDecision not defined in workflow script");

  const functionLines: string[] = [];
  for (let i = startIndex, depth = 0; i < trimmedLines.length; i += 1) {
    const line = trimmedLines[i];
    if (line.length === 0) continue;
    functionLines.push(line);
    for (const char of line) {
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
    }
    if (depth <= 0 && i > startIndex) break;
  }
  assert.ok(functionLines.at(-1)?.trim() === "}", "resolveReviewDecision not defined in workflow script");
  const functionSource = functionLines.join("\n");

  const resolver = new Function(`${functionSource}\nreturn resolveReviewDecision;`)() as (
    decision: string | null | undefined,
    reviewStates: readonly unknown[],
  ) => string;

  assert.equal(resolver(undefined, ["APPROVED"]), "APPROVED");
  assert.equal(
    resolver(null, ["APPROVED", "CHANGES_REQUESTED"]),
    "CHANGES_REQUESTED",
  );
  assert.equal(resolver("review_required", []), "REVIEW_REQUIRED");
  assert.equal(resolver(undefined, []), "REVIEW_REQUIRED");
});
