// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";
import { escapeSentinelString, stableStringify, typeSentinel } from "../src/serialize.js";

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
const CLI_BIN_PATH = new URL("../cli.js", import.meta.url).pathname;
const CLI_LITERAL_KEY_EVAL_SCRIPT = [
  "const cliPath = process.argv.at(-1);",
  "process.argv = [process.argv[0], cliPath, '--', '--literal-key'];",
  "import(cliPath).catch((error) => { console.error(error); process.exit(1); });",
].join(" ");

const SYMBOL_SENTINEL_PREFIX = "__symbol__:";

function decodeSymbolSentinel(value: string): unknown[] {
  const raw = value.startsWith("\"") && value.endsWith("\"")
    ? (JSON.parse(value) as unknown)
    : value;
  assert.equal(typeof raw, "string");
  const sentinel = raw as string;
  assert.ok(sentinel.startsWith(SYMBOL_SENTINEL_PREFIX));
  const payload = JSON.parse(sentinel.slice(SYMBOL_SENTINEL_PREFIX.length)) as unknown;
  assert.ok(Array.isArray(payload));
  return payload as unknown[];
}

function expectLocalSymbolSentinel(value: string, description: string): void {
  const payload = decodeSymbolSentinel(value);
  assert.equal(payload[0], "local");
  assert.equal(payload[payload.length - 1], description);
}

function expectGlobalSymbolSentinel(value: string, description: string): void {
  const payload = decodeSymbolSentinel(value);
  assert.equal(payload.length, 2);
  assert.equal(payload[0], "global");
  assert.equal(payload[1], description);
}

test("package.json bin exposes deterministic-32 entry", async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile(path: string, options: string): Promise<string>;
  };

  const packageJsonUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../package.json", import.meta.url)
    : new URL("../package.json", import.meta.url);

  const packageJsonContent = await readFile(packageJsonUrl.pathname, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as {
    bin?: Record<string, unknown>;
  };

  assert.ok(
    packageJson.bin &&
      typeof packageJson.bin === "object" &&
      !Array.isArray(packageJson.bin),
    "package.json missing bin map",
  );
  assert.equal(packageJson.bin["deterministic-32"], "dist/cli.js");
});

const CLI_STDIN_ERROR_SCRIPT = [
  "(async () => {",
  "  const cliPath = process.argv.at(-1);",
  "  process.stdin.isTTY = false;",
  "  process.argv = [process.argv[0], cliPath];",
  "  setTimeout(() => {",
  "    process.stdin.emit('error', new Error('boom'));",
  "  }, 0);",
  "  try {",
  "    await import(cliPath);",
  "  } catch (error) {",
  "    console.error(error);",
  "    process.exit(1);",
  "  }",
  "})();",
].join("\n");

test("dist build re-exports stableStringify", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;
  const distModule = (await import(
    new URL("../dist/index.js", sourceImportMetaUrl).href,
  )) as { stableStringify?: unknown };
  assert.equal(typeof distModule.stableStringify, "function");
});

test("direct dist import exposes stableStringify", async () => {
  if (import.meta.url.includes("/dist/tests/")) {
    const distModule = (await import(
      new URL("../../dist/index.js", import.meta.url).href,
    )) as { stableStringify?: unknown };
    assert.equal(typeof distModule.stableStringify, "function");
    return;
  }

  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const distModule = (await import(
    new URL("../dist/index.js", sourceImportMetaUrl).href,
  )) as { stableStringify?: unknown };
  assert.equal(typeof distModule.stableStringify, "function");
});

test("dist stableStringify matches JSON.stringify for string literals", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const distSerializeModule = (await import(
    new URL("../dist/serialize.js", sourceImportMetaUrl).href,
  )) as { stableStringify?: ((value: unknown) => string) | undefined };

  assert.equal(typeof distSerializeModule.stableStringify, "function");
  const distStableStringify = distSerializeModule.stableStringify!;

  assert.equal(
    distStableStringify("__string__:payload"),
    JSON.stringify("__string__:payload"),
  );
});

test(
  "dist stableStringify preserves prefixed sentinel string literal content",
  async () => {
    const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
      ? new URL("../../tests/categorizer.test.ts", import.meta.url)
      : import.meta.url;

    const distSerializeModule = (await import(
      new URL("../dist/serialize.js", sourceImportMetaUrl).href,
    )) as { stableStringify?: ((value: unknown) => string) | undefined };

    assert.equal(typeof distSerializeModule.stableStringify, "function");
    const distStableStringify = distSerializeModule.stableStringify!;

    const prefixedLiteral = "__string__:" + typeSentinel("number", "NaN");
    assert.equal(
      distStableStringify(prefixedLiteral),
      JSON.stringify(prefixedLiteral),
    );
    assert.ok(
      distStableStringify(prefixedLiteral) !== distStableStringify(NaN),
    );
  },
);

test("stableStringify matches JSON.stringify for string literals", () => {
  assert.equal(
    stableStringify("__string__:payload"),
    JSON.stringify("__string__:payload"),
  );
});

test(
  "stableStringify matches JSON.stringify for stringified sentinel string literals",
  () => {
    const sentinelStringLiteral = `__string__:${typeSentinel("number", "NaN")}`;
    assert.equal(
      stableStringify(sentinelStringLiteral),
      JSON.stringify(sentinelStringLiteral),
    );
  },
);

test("stableStringify preserves prefixed sentinel string literal content", () => {
  const value = "__string__:" + typeSentinel("number", "NaN");
  assert.equal(stableStringify(value), JSON.stringify(value));
});

test("global and local symbols remain distinguishable", () => {
  const cat32 = new Cat32();
  const globalSymbol = Symbol.for("id");
  const localSymbol = Symbol("id");

  const globalAssignment = cat32.assign(globalSymbol);
  const localAssignment = cat32.assign(localSymbol);

  assert.ok(globalAssignment.key !== localAssignment.key);
  assert.ok(globalAssignment.hash !== localAssignment.hash);

  const serializedMap = stableStringify(
    new Map([
      [globalSymbol, "global"],
      [localSymbol, "local"],
    ]),
  );

  const parsedMap = JSON.parse(serializedMap) as Record<string, string>;
  assert.equal(parsedMap['__symbol__:["global","id"]'], "global");
  const localKey = Object.keys(parsedMap).find((key) => {
    if (!key.startsWith(SYMBOL_SENTINEL_PREFIX)) {
      return false;
    }
    const payload = decodeSymbolSentinel(key);
    return payload[0] === "local" && payload[payload.length - 1] === "id";
  });
  assert.ok(localKey);
  assert.equal(parsedMap[localKey!], "local");
});

test(
  "Cat32 assign distinguishes maps and objects keyed by global vs local symbols",
  () => {
    const cat32 = new Cat32();
    const globalSymbol = Symbol.for("id");
    const localSymbol = Symbol("id");

    const mapGlobalAssignment = cat32.assign(
      new Map([[globalSymbol, "value"]]),
    );
    const mapLocalAssignment = cat32.assign(
      new Map([[localSymbol, "value"]]),
    );

    assert.ok(mapGlobalAssignment.key !== mapLocalAssignment.key);
    assert.ok(mapGlobalAssignment.hash !== mapLocalAssignment.hash);

    const objectWithGlobal: Record<PropertyKey, string> = {
      [globalSymbol]: "value",
    };
    const objectWithLocal: Record<PropertyKey, string> = {
      [localSymbol]: "value",
    };

    const objectGlobalAssignment = cat32.assign(objectWithGlobal);
    const objectLocalAssignment = cat32.assign(objectWithLocal);

    assert.ok(objectGlobalAssignment.key !== objectLocalAssignment.key);
    assert.ok(objectGlobalAssignment.hash !== objectLocalAssignment.hash);
  },
);

test("stableStringify escapes sentinel-like string literals", () => {
  const sentinelLike = "\u0000cat32:number:Infinity\u0000";
  assert.equal(
    stableStringify(sentinelLike),
    JSON.stringify(`__string__:${sentinelLike}`),
  );
});

test("stableStringify distinguishes symbol keys from their string descriptions", () => {
  const symbolKey = Symbol("id");
  const objectWithSymbol: Record<PropertyKey, number> = { [symbolKey]: 1 };
  const objectWithString = { [String(symbolKey)]: 1 };

  assert.ok(
    stableStringify(objectWithSymbol) !== stableStringify(objectWithString),
  );
});

test(
  "stableStringify escapes hole sentinels without colliding with sparse arrays",
  () => {
    const prefixedLiteral = `__string__:${typeSentinel("hole")}`;
    const sentinelLiteral = typeSentinel("hole");
    const holeSentinelLiteral = typeSentinel("hole", "__hole__");
    const sparseArray = new Array(1);

    const prefixedResult = stableStringify([prefixedLiteral]);
    const sentinelResult = stableStringify([sentinelLiteral]);
    const holeSentinelResult = stableStringify([holeSentinelLiteral]);
    const sparseResult = stableStringify(sparseArray);

    assert.equal(prefixedResult, sentinelResult);
    assert.ok(prefixedResult !== sparseResult);
    assert.ok(sentinelResult !== sparseResult);
    assert.ok(holeSentinelResult !== sparseResult);
    assert.ok(holeSentinelResult !== prefixedResult);
  },
);

test("stableStringify differentiates sentinel key from literal NaN key", () => {
  const sentinelKey = typeSentinel("number", "NaN");
  const sentinelObject = { [sentinelKey]: "sentinel" };
  const literalObject = { NaN: "literal" };

  assert.ok(stableStringify(sentinelObject) !== stableStringify(literalObject));
});

test("stableStringify distinguishes literal sentinel-like string keys from NaN", () => {
  const sentinelStringKey = "\u0000cat32:number:NaN\u0000";
  const literalObject = { NaN: 1 };

  assert.ok(
    stableStringify({ [sentinelStringKey]: 1 }) !==
      stableStringify(literalObject),
  );
});

test("Cat32 assign key matches JSON.stringify for string literals", () => {
  const assignment = new Cat32().assign("__string__:payload");
  assert.equal(assignment.key, JSON.stringify("__string__:payload"));
});

test("Cat32 assign key preserves prefixed sentinel string literal content", () => {
  const value = "__string__:" + typeSentinel("number", "NaN");
  const assignment = new Cat32().assign(value);
  assert.equal(assignment.key, JSON.stringify(value));
});

test("Cat32 assign escapes sentinel-like string literal keys", () => {
  const sentinelLike = "\u0000cat32:number:Infinity\u0000";
  const assignment = new Cat32().assign(sentinelLike);
  assert.equal(
    assignment.key,
    JSON.stringify(`__string__:${sentinelLike}`),
  );
});

test("Cat32 assign differentiates sentinel key from literal NaN key", () => {
  const sentinelKey = typeSentinel("number", "NaN");
  const sentinelObject = { [sentinelKey]: "sentinel" };
  const literalObject = { NaN: "literal" };

  const categorizer = new Cat32();

  assert.ok(
    categorizer.assign(sentinelObject).key !==
      categorizer.assign(literalObject).key,
  );
});

test("Cat32 assign keeps literal sentinel-like keys distinct from NaN", () => {
  const sentinelStringKey = "\u0000cat32:number:NaN\u0000";
  const categorizer = new Cat32();

  const sentinelAssignment = categorizer.assign({ [sentinelStringKey]: 1 });
  const literalAssignment = categorizer.assign({ NaN: 1 });

  assert.ok(sentinelAssignment.key !== literalAssignment.key);
  assert.ok(sentinelAssignment.hash !== literalAssignment.hash);
});

test(
  "Cat32 assign keeps hole sentinel literals distinct from sparse array holes",
  () => {
    const categorizer = new Cat32();
    const prefixedLiteral = `__string__:${typeSentinel("hole")}`;
    const sentinelLiteral = typeSentinel("hole");
    const holeSentinelLiteral = typeSentinel("hole", "__hole__");
    const sparseArray = new Array(1);

    const prefixedAssignment = categorizer.assign([prefixedLiteral]);
    const sentinelAssignment = categorizer.assign([sentinelLiteral]);
    const holeSentinelAssignment = categorizer.assign([holeSentinelLiteral]);
    const sparseAssignment = categorizer.assign(sparseArray);

    assert.equal(prefixedAssignment.key, sentinelAssignment.key);
    assert.equal(prefixedAssignment.hash, sentinelAssignment.hash);
    assert.ok(prefixedAssignment.key !== sparseAssignment.key);
    assert.ok(prefixedAssignment.hash !== sparseAssignment.hash);
    assert.ok(holeSentinelAssignment.key !== sparseAssignment.key);
    assert.ok(holeSentinelAssignment.hash !== sparseAssignment.hash);
    assert.ok(holeSentinelAssignment.key !== prefixedAssignment.key);
    assert.ok(holeSentinelAssignment.hash !== prefixedAssignment.hash);
  },
);

test("Cat32 assign treats prefixed literal strings as distinct from NaN", () => {
  const categorizer = new Cat32();
  const literalAssignment = categorizer.assign(
    "__string__:\u0000cat32:number:NaN\u0000",
  );
  const nanAssignment = categorizer.assign(Number.NaN);
  const sentinelAssignment = categorizer.assign(typeSentinel("number", "NaN"));

  assert.ok(literalAssignment.key !== nanAssignment.key);
  assert.ok(literalAssignment.hash !== nanAssignment.hash);
  assert.equal(literalAssignment.key, sentinelAssignment.key);
  assert.equal(literalAssignment.hash, sentinelAssignment.hash);
});

test("dist stableStringify handles Map bucket ordering", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const distSerializeModule = (await import(
    new URL("../dist/serialize.js", sourceImportMetaUrl).href,
  )) as { stableStringify?: ((value: unknown) => string) | undefined };

  assert.equal(typeof distSerializeModule.stableStringify, "function");
  const distStableStringify = distSerializeModule.stableStringify!;

  const mapAscending = new Map<unknown, unknown>([
    [1, "number"],
    ["1", "string"],
  ]);
  const mapDescending = new Map<unknown, unknown>([
    ["1", "string"],
    [1, "number"],
  ]);

  assert.equal(
    distStableStringify(mapAscending),
    distStableStringify(mapDescending),
  );
});

test(
  "dist stableStringify and Cat32 assign keep hole sentinel cases distinct",
  async () => {
    const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
      ? new URL("../../tests/categorizer.test.ts", import.meta.url)
      : import.meta.url;

    const distSerializeModule = (await import(
      new URL("../dist/serialize.js", sourceImportMetaUrl).href,
    )) as {
      stableStringify?: ((value: unknown) => string) | undefined;
    };

    assert.equal(typeof distSerializeModule.stableStringify, "function");
    const distStableStringify = distSerializeModule.stableStringify!;

    const distModule = (await import(
      new URL("../dist/index.js", sourceImportMetaUrl).href,
    )) as { Cat32?: typeof Cat32 };

    assert.equal(typeof distModule.Cat32, "function");
    const DistCat32 = distModule.Cat32!;

    const prefixedLiteral = `__string__:${typeSentinel("hole")}`;
    const sentinelLiteral = typeSentinel("hole");
    const holeSentinelLiteral = typeSentinel("hole", "__hole__");
    const sparseArray = new Array(1);

    const prefixedKey = distStableStringify([prefixedLiteral]);
    const sentinelKey = distStableStringify([sentinelLiteral]);
    const holeSentinelKey = distStableStringify([holeSentinelLiteral]);
    const sparseKey = distStableStringify(sparseArray);

    assert.equal(prefixedKey, sentinelKey);
    assert.ok(prefixedKey !== sparseKey);
    assert.ok(sentinelKey !== sparseKey);
    assert.ok(holeSentinelKey !== sparseKey);
    assert.ok(holeSentinelKey !== prefixedKey);

    const categorizer = new DistCat32();
    const prefixedAssignment = categorizer.assign([prefixedLiteral]);
    const sentinelAssignment = categorizer.assign([sentinelLiteral]);
    const holeSentinelAssignment = categorizer.assign([holeSentinelLiteral]);
    const sparseAssignment = categorizer.assign(sparseArray);

    assert.equal(prefixedAssignment.key, sentinelAssignment.key);
    assert.equal(prefixedAssignment.hash, sentinelAssignment.hash);
    assert.ok(prefixedAssignment.key !== sparseAssignment.key);
    assert.ok(prefixedAssignment.hash !== sparseAssignment.hash);
    assert.ok(holeSentinelAssignment.key !== sparseAssignment.key);
    assert.ok(holeSentinelAssignment.hash !== sparseAssignment.hash);
    assert.ok(holeSentinelAssignment.key !== prefixedAssignment.key);
    assert.ok(holeSentinelAssignment.hash !== prefixedAssignment.hash);
  },
);

test("dist Cat32 assign distinguishes Map keys when String(key) collides", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const distModule = (await import(
    new URL("../dist/index.js", sourceImportMetaUrl).href,
  )) as { Cat32?: typeof Cat32 };

  assert.equal(typeof distModule.Cat32, "function");
  const DistCat32 = distModule.Cat32!;

  const obj = { foo: 1 };
  const instance = new DistCat32();

  const mixedAssignment = instance.assign(
    new Map<unknown, unknown>([
      [obj, "object"],
      [String(obj), "string"],
    ]),
  );
  const stringOnlyAssignment = instance.assign(
    new Map<unknown, unknown>([[String(obj), "string"]]),
  );

  assert.ok(mixedAssignment.hash !== stringOnlyAssignment.hash);
  assert.ok(mixedAssignment.key !== stringOnlyAssignment.key);
});

test("stableStringify maps simple entries without throwing", () => {
  const map = new Map([["k", 1]]);
  const result = stableStringify(map);
  assert.equal(result, "{\"k\":1}");
});

test("Cat32 assign handles Map input deterministically", () => {
  const instance = new Cat32();
  const assignment = instance.assign(new Map([["k", 1]]));
  assert.equal(assignment.index, 23);
  assert.equal(assignment.label, "X");
  assert.equal(assignment.hash, "4f77d9b7");
  assert.equal(assignment.key, "{\"k\":1}");
});

test("Cat32 assign retains distinct Map entries for identical property keys", () => {
  const c = new Cat32();
  const first = c.assign(
    new Map<unknown, string>([
      [{}, "a"],
      [{}, "b"],
    ]),
  );
  const second = c.assign(new Map<unknown, string>([[{}, "a"]]));
  assert.ok(first.key !== second.key);
  assert.ok(first.hash !== second.hash);
});

function createNonEnumerableToStringObject(literal: string): Record<string, never> {
  const object: Record<string, never> = {};
  Object.defineProperty(object, "toString", {
    value() {
      return literal;
    },
    enumerable: false,
  });
  return object;
}

function customObjectReturning(literal: string): Record<string, never> {
  return createNonEnumerableToStringObject(literal);
}

test(
  "stableStringify differentiates Map entries from sentinel-style literal strings",
  () => {
    const baseLiteral = "__string__:foo";
    const suffix = "__string__:\u0000cat32:map-entry-index:1\u0000";

    const duplicateLike = new Map<unknown, string>([
      [createNonEnumerableToStringObject(baseLiteral), "a"],
      [createNonEnumerableToStringObject(baseLiteral), "b"],
    ]);

    const sentinelLike = new Map<unknown, string>([
      [createNonEnumerableToStringObject(baseLiteral), "a"],
      [
        createNonEnumerableToStringObject(`${baseLiteral}${suffix}`),
        "b",
      ],
    ]);

    assert.ok(stableStringify(duplicateLike) !== stableStringify(sentinelLike));
  },
);

test(
  "Cat32 assign differentiates Map entries from sentinel-style literal strings",
  () => {
    const baseLiteral = "__string__:foo";
    const suffix = "__string__:\u0000cat32:map-entry-index:1\u0000";

    const duplicateLike = new Map<unknown, string>([
      [createNonEnumerableToStringObject(baseLiteral), "a"],
      [createNonEnumerableToStringObject(baseLiteral), "b"],
    ]);

    const sentinelLike = new Map<unknown, string>([
      [createNonEnumerableToStringObject(baseLiteral), "a"],
      [
        createNonEnumerableToStringObject(`${baseLiteral}${suffix}`),
        "b",
      ],
    ]);

    const categorizer = new Cat32();
    const duplicateAssignment = categorizer.assign(duplicateLike);
    const sentinelAssignment = categorizer.assign(sentinelLike);

    assert.ok(duplicateAssignment.key !== sentinelAssignment.key);
    assert.ok(duplicateAssignment.hash !== sentinelAssignment.hash);
  },
);

test("Map serialization differentiates duplicate-like object entries", () => {
  const withDuplicates = new Map<unknown, string>([
    [{}, "a"],
    [{}, "b"],
  ]);
  const singleEntry = new Map<unknown, string>([[{}, "a"]]);

  assert.ok(stableStringify(withDuplicates) !== stableStringify(singleEntry));

  const cat = new Cat32();
  const withDuplicatesAssignment = cat.assign(withDuplicates);
  const singleEntryAssignment = cat.assign(singleEntry);

  assert.ok(withDuplicatesAssignment.key !== singleEntryAssignment.key);
  assert.ok(withDuplicatesAssignment.hash !== singleEntryAssignment.hash);
});

test("Cat32 assign distinguishes Map keys when String(key) collides", () => {
  const obj = { foo: 1 };
  const instance = new Cat32();

  const mixedAssignment = instance.assign(
    new Map<unknown, unknown>([
      [obj, "object"],
      [String(obj), "string"],
    ]),
  );
  const stringOnlyAssignment = instance.assign(
    new Map<unknown, unknown>([[String(obj), "string"]]),
  );

  assert.ok(mixedAssignment.hash !== stringOnlyAssignment.hash);
  assert.ok(mixedAssignment.key !== stringOnlyAssignment.key);
});

test(
  "stableStringify and Cat32 assign distinguish Map array key collisions",
  () => {
    const mapWithArrayKey = new Map<unknown, string>([
      [[1, 2], "array"],
      ["1,2", "string"],
    ]);
    const mapWithStringKey = new Map<string, string>([["1,2", "string"]]);

    assert.ok(
      stableStringify(mapWithArrayKey) !==
        stableStringify(mapWithStringKey),
    );

    const cat = new Cat32();
    const arrayAssignment = cat.assign(mapWithArrayKey);
    const stringAssignment = cat.assign(mapWithStringKey);

    assert.ok(arrayAssignment.key !== stringAssignment.key);
  },
);

test(
  "stableStringify and Cat32 assign distinguish Map toString collisions",
  () => {
    const mapWithCustomObject = new Map<unknown, string>([
      [customObjectReturning("1,2"), "array"],
      ["1,2", "string"],
    ]);
    const mapWithStringKey = new Map<string, string>([["1,2", "string"]]);

    assert.ok(
      stableStringify(mapWithCustomObject) !==
        stableStringify(mapWithStringKey),
    );

    const cat = new Cat32();
    const customObjectAssignment = cat.assign(mapWithCustomObject);
    const stringAssignment = cat.assign(mapWithStringKey);

    assert.ok(customObjectAssignment.key !== stringAssignment.key);
  },
);

test("Map null key remains distinct from string 'null' key", () => {
  const c = new Cat32();
  const mapWithNullKey = new Map<unknown, string>([[null, "a"]]);
  const mapWithStringKey = new Map<string, string>([["null", "a"]]);

  const nullAssignment = c.assign(mapWithNullKey);
  const stringAssignment = c.assign(mapWithStringKey);

  assert.ok(
    nullAssignment.key !== stringAssignment.key,
    'Cat32 canonical key should differ for null and "null" Map keys',
  );
  assert.ok(
    nullAssignment.hash !== stringAssignment.hash,
    'Cat32 hash should differ for null and "null" Map keys',
  );

  const nullSerialized = stableStringify(mapWithNullKey);
  const stringSerialized = stableStringify(mapWithStringKey);

  assert.ok(
    nullSerialized !== stringSerialized,
    'stableStringify should distinguish null and "null" Map keys',
  );
});

test(
  "Cat32 assign differentiates Map object keys from sentinel-style string keys",
  () => {
    const cat = new Cat32();

    const objectKeyAssignment = cat.assign(
      new Map<unknown, string>([
        [{}, "a"],
        [{}, "b"],
      ]),
    );

    const stringKeyAssignment = cat.assign(
      new Map<string, string>([
        ["[object Object]", "a"],
        ["[object Object]\u0000cat32:map-entry-index:1\u0000", "b"],
      ]),
    );

    assert.ok(objectKeyAssignment.key !== stringKeyAssignment.key);
    assert.ok(objectKeyAssignment.hash !== stringKeyAssignment.hash);
  },
);

test("Cat32 distinguishes Map symbol keys from string descriptions", () => {
  const symbolKey = Symbol("id");
  const cat = new Cat32();

  const symbolMapAssignment = cat.assign(new Map([[symbolKey, 1]]));
  const stringMapAssignment = cat.assign(new Map([[String(symbolKey), 1]]));

  assert.ok(
    stableStringify(new Map([[symbolKey, 1]])) !==
      stableStringify(new Map([[String(symbolKey), 1]])),
  );
  assert.ok(symbolMapAssignment.key !== stringMapAssignment.key);
  assert.ok(symbolMapAssignment.hash !== stringMapAssignment.hash);
});

test(
  "stableStringify and Cat32 assign distinguish duplicate symbol sentinel collisions",
  () => {
    const left = Symbol("dup");
    const right = Symbol("dup");

    const original = new Map<symbol, string>([
      [left, "left"],
      [right, "right"],
    ]);
    const swapped = new Map<symbol, string>([
      [left, "right"],
      [right, "left"],
    ]);

    assert.ok(stableStringify(original) !== stableStringify(swapped));

    const cat = new Cat32();
    const originalAssignment = cat.assign(original);
    const swappedAssignment = cat.assign(swapped);

    assert.ok(originalAssignment.key !== swappedAssignment.key);
  },
);

test("stableStringify distinguishes Map object keys from plain object keys", () => {
  const obj = { foo: 1 };

  const mapKey = stableStringify(new Map([[obj, "value"]]));
  const objectKey = stableStringify({ [String(obj)]: "value" });

  assert.ok(mapKey !== objectKey);

  const cat = new Cat32();
  const mapAssignment = cat.assign(new Map([[obj, "value"]]));
  const objectAssignment = cat.assign({ [String(obj)]: "value" });

  assert.ok(mapAssignment.key !== objectAssignment.key);
  assert.ok(mapAssignment.hash !== objectAssignment.hash);
});

test("Map serialization preserves entries when String(key) collisions occur", () => {
  const keyA = { id: 1 };
  const keyB = { id: 2 };
  const scenarios = [
    {
      map: new Map<unknown, unknown>([
        [1, "number"],
        ["1", "string"],
      ]),
      comparator: new Map<unknown, unknown>([["1", "string"]]),
    },
    {
      map: new Map<unknown, unknown>([
        [keyA, "a"],
        [keyB, "b"],
      ]),
      comparator: new Map<unknown, unknown>([[keyA, "a"]]),
    },
  ];

  for (const { map, comparator } of scenarios) {
    const serialized = stableStringify(map);
    const baseline = stableStringify(comparator);
    assert.ok(serialized !== baseline);

    const cat = new Cat32();
    const mapAssignment = cat.assign(map);
    const baselineAssignment = cat.assign(comparator);
    assert.ok(mapAssignment.key !== baselineAssignment.key);
  }
});

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

test("repository tsc build succeeds", async () => {
  const sourceImportMetaUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../../tests/categorizer.test.ts", import.meta.url)
    : import.meta.url;

  const repoRoot = new URL("../", sourceImportMetaUrl).pathname;
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(
    "tsc",
    ["-p", "tsconfig.json", "--pretty", "false"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
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
});

test("Cat32 assigns distinct keys for primitive strings and non-strings", () => {
  const cat = new Cat32();

  const stringTrue = cat.assign("true");
  const booleanTrue = cat.assign(true);
  assert.ok(stringTrue.key !== booleanTrue.key);
  assert.ok(stringTrue.hash !== booleanTrue.hash);

  const stringNumber = cat.assign("123");
  const numeric = cat.assign(123);
  assert.ok(stringNumber.key !== numeric.key);
  assert.ok(stringNumber.hash !== numeric.hash);
});

test("Cat32 assigns distinct keys for sets with mixed primitive types", () => {
  const cat = new Cat32();

  const mixedSet = cat.assign(new Set([1, "1"]));
  const numericSet = cat.assign(new Set([1]));

  assert.ok(mixedSet.key !== numericSet.key);
  assert.ok(mixedSet.hash !== numericSet.hash);
});

test("Cat32 normalizes Map keys with special numeric values", () => {
  const cat = new Cat32();

  const mapNaN = cat.assign(new Map([[Number.NaN, "v"]]));
  const objectNaN = cat.assign({ NaN: "v" });
  assert.ok(mapNaN.key !== objectNaN.key);
  assert.ok(mapNaN.hash !== objectNaN.hash);
  assert.ok(
    mapNaN.key.includes("\\u0000cat32:propertykey:"),
    "Map NaN key should carry a property key sentinel",
  );

  const sentinelNaNKey: string = typeSentinel("number", "NaN");
  const objectNaNSentinel = cat.assign(
    Object.fromEntries([[sentinelNaNKey, "v"]]) as Record<string, string>,
  );
  assert.ok(mapNaN.key !== objectNaNSentinel.key);
  assert.ok(mapNaN.hash !== objectNaNSentinel.hash);

  const mapInfinity = cat.assign(new Map([[Infinity, "v"]]));
  const objectInfinity = cat.assign({ Infinity: "v" });
  assert.ok(mapInfinity.key !== objectInfinity.key);
  assert.ok(mapInfinity.hash !== objectInfinity.hash);
  assert.ok(
    mapInfinity.key.includes("\\u0000cat32:propertykey:"),
    "Map Infinity key should carry a property key sentinel",
  );

  const sentinelInfinityKey: string = typeSentinel("number", "Infinity");
  const objectInfinitySentinel = cat.assign(
    Object.fromEntries([[sentinelInfinityKey, "v"]]) as Record<string, string>,
  );
  assert.ok(mapInfinity.key !== objectInfinitySentinel.key);
  assert.ok(mapInfinity.hash !== objectInfinitySentinel.hash);

  const mapBigInt = cat.assign(new Map([[1n, "v"]]));
  const objectBigInt = cat.assign({ [String(1n)]: "v" });
  assert.ok(mapBigInt.key !== objectBigInt.key);
  assert.ok(mapBigInt.hash !== objectBigInt.hash);
  assert.ok(
    mapBigInt.key.includes("\\u0000cat32:propertykey:"),
    "Map bigint key should carry a property key sentinel",
  );

  const sentinelBigIntKey: string = typeSentinel("bigint", "1");
  const objectBigIntSentinel = cat.assign(
    Object.fromEntries([[sentinelBigIntKey, "v"]]) as Record<string, string>,
  );
  assert.ok(mapBigInt.key !== objectBigIntSentinel.key);
  assert.ok(mapBigInt.hash !== objectBigIntSentinel.hash);
});

test("Cat32 assigns identical keys for Maps regardless of insertion order", () => {
  const cat = new Cat32();

  const map = new Map<unknown, string>([
    [1, "number"],
    ["1", "string"],
  ]);
  const reversed = new Map<unknown, string>([
    ["1", "string"],
    [1, "number"],
  ]);

  const original = cat.assign(map);
  const flipped = cat.assign(reversed);

  assert.equal(original.key, flipped.key);
  assert.equal(original.hash, flipped.hash);
});

test("Cat32 treats enumerable Symbol keys consistently between objects and maps", () => {
  const cat = new Cat32();
  const symbolKey = Symbol("enumerable");

  const emptyObject = cat.assign({});
  const objectWithSymbol = cat.assign({ [symbolKey]: "value" });

  assert.ok(objectWithSymbol.key !== emptyObject.key);
  assert.ok(objectWithSymbol.hash !== emptyObject.hash);

  const mapWithSymbol = cat.assign(new Map([[symbolKey, "value"]]));

  assert.equal(objectWithSymbol.key, mapWithSymbol.key);
  assert.equal(objectWithSymbol.hash, mapWithSymbol.hash);
});

test(
  "Cat32 assigns Maps with distinct Symbols sharing descriptions uniquely",
  () => {
    const cat = new Cat32();
    const symbolA = Symbol("duplicate");
    const symbolB = Symbol("duplicate");

    const mapWithDuplicateSymbols = new Map<symbol, string>([
      [symbolA, "first"],
      [symbolB, "second"],
    ]);
    const objectWithDuplicateSymbols = {
      [symbolA]: "first",
      [symbolB]: "second",
    };

    const mapAssignment = cat.assign(mapWithDuplicateSymbols);
    const objectAssignment = cat.assign(objectWithDuplicateSymbols);

    assert.ok(mapAssignment.key !== objectAssignment.key);
    assert.ok(mapAssignment.hash !== objectAssignment.hash);
    assert.equal(mapAssignment.key, stableStringify(mapWithDuplicateSymbols));
    assert.equal(objectAssignment.key, stableStringify(objectWithDuplicateSymbols));
  },
);

test(
  "stableStringify distinguishes swapped Map values for duplicate Symbol descriptions",
  () => {
    const cat = new Cat32();
    const left = Symbol("duplicate");
    const right = Symbol("duplicate");

    const original = new Map<symbol, string>([
      [left, "left"],
      [right, "right"],
    ]);
    const swapped = new Map<symbol, string>([
      [left, "right"],
      [right, "left"],
    ]);

    const originalSerialized = stableStringify(original);
    const swappedSerialized = stableStringify(swapped);

    assert.ok(originalSerialized !== swappedSerialized);

    const originalAssignment = cat.assign(original);
    const swappedAssignment = cat.assign(swapped);

    assert.ok(originalAssignment.key !== swappedAssignment.key);
  },
);

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

test("CLI treats values after double dash as literal key", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], ["-e", CLI_LITERAL_KEY_EVAL_SCRIPT, CLI_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  const parsed = JSON.parse(stdout) as { key: string };
  assert.equal(parsed.key, stableStringify("--literal-key"));
});

test("CLI accepts flag values separated by whitespace", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_PATH, "--salt", "foo", "bar"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  const parsed = JSON.parse(stdout) as { hash: string; key: string };
  const expected = new Cat32({ salt: "foo" }).assign("bar");
  assert.equal(parsed.hash, expected.hash);
  assert.equal(parsed.key, expected.key);
});

test("CLI exits with code 2 when --salt is missing a value", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_PATH, "--salt"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    2,
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
});

test("CLI exits with code 1 when stdin emits an error", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], ["-e", CLI_STDIN_ERROR_SCRIPT, CLI_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });

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
    1,
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.ok(
    stderr.toLowerCase().includes("boom"),
    `stderr did not include boom: ${stderr}`,
  );
  assert.equal(stdout, "");
});

test("cat32 binary accepts flag values separated by whitespace", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "--salt", "foo", "bar"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  const parsed = JSON.parse(stdout) as { hash: string; key: string };
  const expected = new Cat32({ salt: "foo" }).assign("bar");
  assert.equal(parsed.hash, expected.hash);
  assert.equal(parsed.key, expected.key);
});

test("cat32 binary outputs compact JSON when --json is followed by positional input", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "--json", "foo"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  assert.ok(stdout.endsWith("\n"));
  const body = stdout.slice(0, -1);
  const parsed = JSON.parse(body) as { hash: string; key: string };
  const expected = new Cat32().assign("foo");
  assert.equal(parsed.hash, expected.hash);
  assert.equal(parsed.key, expected.key);
  assert.equal(body, JSON.stringify(parsed));
});

test("cat32 binary exits with code 2 for unsupported --json= value", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "--json=foo"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    2,
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.ok(
    stderr.includes('RangeError: unsupported --json value "foo"'),
    `stderr missing unsupported --json value error\n${stderr}`,
  );
});

test("cat32 binary outputs NDJSON by default", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "cli-bin-default"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  assert.ok(stdout.endsWith("\n"));
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  assert.equal(lines.length, 1);

  const parsed = JSON.parse(lines[0]) as { hash: string; key: string };
  const expected = new Cat32().assign("cli-bin-default");
  assert.equal(parsed.hash, expected.hash);
  assert.equal(parsed.key, expected.key);
});

test("cat32 binary respects --json and --pretty flags", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "--json", "--pretty", "cli-bin-pretty"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

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
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  assert.ok(stdout.endsWith("\n"));
  const prettyBody = stdout.slice(0, -1);
  const lines = prettyBody.split("\n");
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(line.trim().length > 0, `encountered empty line in output: ${stdout}`);
  }

  const parsed = JSON.parse(prettyBody) as { hash: string; key: string };
  const expected = new Cat32().assign("cli-bin-pretty");
  assert.equal(parsed.hash, expected.hash);
  assert.equal(parsed.key, expected.key);
});

test("cat32 binary exits with code 2 when --namespace is missing a value", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const child = spawn(process.argv[0], [CLI_BIN_PATH, "--namespace"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end();

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
    2,
    `cat32 failed: exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
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

test("Cat32 salt namespace options avoid literal collision", () => {
  const literal = new Cat32({ salt: "foo|ns:bar" }).assign("value");
  const namespaced = new Cat32({ salt: "foo", namespace: "bar" }).assign("value");

  assert.ok(literal.hash !== namespaced.hash);
});

test("salt/namespace combinations yield distinct canonical key/hash pairs", () => {
  const input = { value: "payload" };
  const baseCanonicalKey = new Cat32().assign(input).key;

  const combinations = [
    { name: "default", options: {} },
    { name: "namespace empty", options: { namespace: "" } },
    { name: "salt only", options: { salt: "salt-value" } },
    { name: "salt with empty namespace", options: { salt: "salt-value", namespace: "" } },
    { name: "namespace provided", options: { namespace: "namespace-value" } },
    { name: "salt and namespace provided", options: { salt: "salt-value", namespace: "namespace-value" } },
  ];

  const seenPairs = new Map<string, string>();
  const seenHashes = new Map<string, string>();

  for (const { name, options } of combinations) {
    const assignment = new Cat32(options).assign(input);
    assert.equal(assignment.key, baseCanonicalKey);

    const pair = `${assignment.key}|${assignment.hash}`;
    const previousPair = seenPairs.get(pair);
    assert.equal(
      previousPair,
      undefined,
      `combination "${name}" reuses canonical key/hash from "${previousPair}"`,
    );
    seenPairs.set(pair, name);

    const previousHash = seenHashes.get(assignment.hash);
    assert.equal(
      previousHash,
      undefined,
      `combination "${name}" reuses hash from "${previousHash}"`,
    );
    seenHashes.set(assignment.hash, name);
  }
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

  const stringValue = "foo";
  const numberValue = 123;
  const bigintValue = 1n;
  const nanValue = Number.NaN;
  const symbolValue = Symbol("x");

  assert.equal(c.assign(stringValue).key, stableStringify(stringValue));
  assert.equal(c.assign(numberValue).key, stableStringify(numberValue));
  assert.equal(c.assign(bigintValue).key, stableStringify(bigintValue));
  assert.equal(c.assign(nanValue).key, stableStringify(nanValue));
  assert.equal(c.assign(symbolValue).key, stableStringify(symbolValue));
});

test("functions serialize to strings and symbols use canonical sentinels", () => {
  const fn = function foo() {};
  const localSymbol = Symbol("x");
  const globalSymbol = Symbol.for("x");

  assert.equal(stableStringify(fn), String(fn));
  const localSerialized = stableStringify(localSymbol);
  expectLocalSymbolSentinel(localSerialized, "x");
  const globalSerialized = stableStringify(globalSymbol);
  expectGlobalSymbolSentinel(globalSerialized, "x");

  const c = new Cat32();

  assert.equal(c.assign(fn).key, String(fn));
  assert.equal(c.assign(localSymbol).key, localSerialized);
  assert.equal(c.assign(globalSymbol).key, globalSerialized);
});

test("string sentinel literal is distinct from date value", () => {
  const c = new Cat32();
  const iso = "2024-01-02T03:04:05.000Z";
  const literal = `__date__:${iso}`;
  const sentinelAssignment = c.assign(literal);
  const dateAssignment = c.assign(new Date(iso));
  assert.ok(sentinelAssignment.key !== dateAssignment.key);
  assert.equal(sentinelAssignment.key, JSON.stringify(`__string__:${literal}`));
  assert.equal(dateAssignment.key, JSON.stringify(`__date__:${iso}`));
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

test("README library example overrides use canonical keys", () => {
  const overrides = {
    [stableStringify("vip-user")]: 0,
    [stableStringify({ id: "audited" })]: "A",
  } as const;

  const cat = new Cat32({
    salt: "projectX",
    namespace: "v1",
    overrides,
  });

  assert.equal(cat.index("vip-user"), 0);

  const audited = cat.assign({ id: "audited" });
  assert.equal(audited.label, "A");
  assert.equal(cat.labelOf({ id: "audited" }), "A");

  const assignment = cat.assign("hello");
  assert.equal(typeof assignment.hash, "string");
  assert.equal(assignment.key, stableStringify("hello"));
});

test("override rejects NaN with explicit error", () => {
  assert.throws(
    () => new Cat32({ overrides: { foo: Number.NaN } }),
    (error) => error instanceof Error && error.message === "index out of range: NaN",
  );
});

test("override rejects NaN", () => {
  assert.throws(
    () => new Cat32({ overrides: { foo: Number.NaN } }),
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
    const idx = c.index(k);
    assert.ok(idx >= 0 && idx <= 31);
  }
});

test("normalization NFKC merges fullwidth", () => {
  const c = new Cat32({ normalize: "nfkc" });
  const x = c.assign("Ａ"); // fullwidth A
  const y = c.assign("A");
  assert.equal(x.index, y.index);
});

test("normalization NFKD merges compatibility characters", () => {
  const c = new Cat32({ normalize: "nfkd" });
  const x = c.assign("Ａ"); // fullwidth A
  const y = c.assign("A");
  assert.equal(x.index, y.index);
});

test("unsupported normalization option throws", () => {
  assert.throws(
    () =>
      new Cat32({ normalize: "unsupported" as unknown as import("../src/categorizer.js").NormalizeMode }),
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

test("stableStringify escapes undefined sentinel string literal", () => {
  assert.equal(
    stableStringify("__undefined__"),
    JSON.stringify("__string__:__undefined__"),
  );
});

test("stableStringify serializes undefined and Date sentinels", () => {
  const iso = "2024-01-02T03:04:05.678Z";

  assert.equal(stableStringify(undefined), JSON.stringify("__undefined__"));
  assert.equal(stableStringify(new Date(iso)), JSON.stringify(`__date__:${iso}`));
});

test("stableStringify serializes string literal sentinels as JSON strings", () => {
  const literal = "__string__:payload";
  const serialized = stableStringify(literal);
  const expected = JSON.stringify(literal);
  assert.equal(serialized, expected);

  const cat = new Cat32();
  const assignment = cat.assign(literal);
  assert.equal(assignment.key, expected);
});

test("Cat32 assign handles undefined and Date literals", () => {
  const cat = new Cat32();
  const iso = "2024-01-02T03:04:05.678Z";

  cat.assign(undefined);
  cat.assign(new Date(iso));
});

test("stableStringify uses String() for functions and sentinels for symbols", () => {
  const fn = function foo() {};
  const localSymbol = Symbol("x");
  const globalSymbol = Symbol.for("x");

  assert.equal(stableStringify(fn), String(fn));
  expectLocalSymbolSentinel(stableStringify(localSymbol), "x");
  expectGlobalSymbolSentinel(stableStringify(globalSymbol), "x");
});

test("canonical key follows String() for functions and sentinel encoding for symbols", () => {
  const c = new Cat32();
  const fn = function foo() {};
  const localSymbol = Symbol("x");
  const globalSymbol = Symbol.for("x");

  assert.equal(c.assign(fn).key, String(fn));
  const localKey = c.assign(localSymbol).key;
  expectLocalSymbolSentinel(localKey, "x");
  assert.equal(localKey, stableStringify(localSymbol));
  const globalKey = c.assign(globalSymbol).key;
  expectGlobalSymbolSentinel(globalKey, "x");
  assert.equal(globalKey, stableStringify(globalSymbol));
});

test("string sentinel literals remain literal canonical keys", () => {
  const assignment = new Cat32().assign("__date__:2024-01-01Z");
  assert.equal(assignment.key, stableStringify("__date__:2024-01-01Z"));
});

test("escapeSentinelString leaves string literal sentinel prefix untouched", () => {
  const sentinelLike = "__string__:wrapped";
  assert.equal(escapeSentinelString(sentinelLike), sentinelLike);
});

test("stableStringify serializes explicit string sentinels", () => {
  const sentinel = typeSentinel("string", "already-wrapped");
  const expected = JSON.stringify(sentinel);
  assert.equal(stableStringify(sentinel), expected);
});

test("values containing __string__ escape exactly once", () => {
  const literal = "__string__:payload";
  const sentinel = typeSentinel("string", literal);
  assert.equal(stableStringify(literal), JSON.stringify(literal));
  assert.equal(stableStringify(sentinel), JSON.stringify(sentinel));
});

test("undefined sentinel string literal differs from literal undefined in arrays", () => {
  const c = new Cat32();
  const sentinelAssignment = c.assign({ list: ["__undefined__"] });
  const literalAssignment = c.assign({ list: [undefined] });

  const sentinelKey = stableStringify({ list: ["__undefined__"] });
  const literalKey = stableStringify({ list: [undefined] });

  assert.equal(sentinelAssignment.key, sentinelKey);
  assert.equal(literalAssignment.key, literalKey);
  assert.ok(sentinelAssignment.key !== literalAssignment.key);
  assert.ok(sentinelAssignment.hash !== literalAssignment.hash);
});

test("date sentinel string literal differs from Date instance in arrays", () => {
  const c = new Cat32();
  const iso = "2024-04-01T12:34:56.789Z";
  const sentinelAssignment = c.assign({ list: [`__date__:${iso}`] });
  const literalAssignment = c.assign({ list: [new Date(iso)] });

  const sentinelKey = stableStringify({ list: [`__date__:${iso}`] });
  const literalKey = stableStringify({ list: [new Date(iso)] });

  assert.equal(sentinelAssignment.key, sentinelKey);
  assert.equal(literalAssignment.key, literalKey);
  assert.ok(sentinelAssignment.key !== literalAssignment.key);
  assert.ok(sentinelAssignment.hash !== literalAssignment.hash);
});

test("Map keys align with plain object representation when property keys are unique", () => {
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

  assert.ok(duplicateKeyMapAssignment.key !== duplicateKeyObjectAssignment.key);
  assert.ok(duplicateKeyMapAssignment.hash !== duplicateKeyObjectAssignment.hash);
});

test("Map Date key uses ISO sentinel distinct from plain object string key", () => {
  const c = new Cat32();
  const date = new Date("2024-05-01T00:00:00.000Z");

  const mapAssignment = c.assign(new Map([[date, "value"]]));
  const objectAssignment = c.assign({ [String(date)]: "value" });

  assert.ok(mapAssignment.key.includes(`"__date__:${date.toISOString()}"`));
  assert.ok(mapAssignment.key !== objectAssignment.key);
  assert.ok(mapAssignment.hash !== objectAssignment.hash);
});

test("Map duplicate property keys retain distinct entries per key type", () => {
  const c = new Cat32();

  const mapAssignment = c.assign(
    new Map<unknown, string>([
      [0, "number"],
      ["0", "string"],
    ]),
  );
  const reverseMapAssignment = c.assign(
    new Map<unknown, string>([
      ["0", "string"],
      [0, "number"],
    ]),
  );
  const objectAssignment = c.assign({ 0: "string" });

  assert.equal(mapAssignment.key, reverseMapAssignment.key);
  assert.equal(mapAssignment.hash, reverseMapAssignment.hash);
  assert.ok(mapAssignment.key !== objectAssignment.key);
  assert.ok(mapAssignment.hash !== objectAssignment.hash);
});

test(
  "Map canonicalization differentiates object keys sharing string identity",
  () => {
    const c = new Cat32();
    const objectKey = { label: "duplicate" };
    const stringKey = String(objectKey);

    const map = new Map<unknown, string>([
      [objectKey, "object"],
      [stringKey, "string"],
    ]);
    const assignment = c.assign(map);
    const serialized = stableStringify(map);

    assert.ok(
      serialized.includes("\\u0000cat32:propertykey:"),
      "stableStringify should sentinelize non-string Map keys",
    );
    assert.ok(
      assignment.key.includes("\\u0000cat32:propertykey:"),
      "Cat32 canonical key should retain property key sentinel",
    );

    const reversedAssignment = c.assign(
      new Map<unknown, string>([
        [stringKey, "string"],
        [objectKey, "object"],
      ]),
    );

    assert.equal(assignment.key, reversedAssignment.key);
    assert.equal(assignment.hash, reversedAssignment.hash);

    const stringOnlyAssignment = c.assign(
      new Map<string, string>([[stringKey, "string"]]),
    );

    assert.ok(assignment.key !== stringOnlyAssignment.key);
    assert.ok(assignment.hash !== stringOnlyAssignment.hash);
  },
);

test("Cat32 normalizes duplicate-like Map entries deterministically", () => {
  const c = new Cat32();

  const forwardOrder = c.assign(
    new Map<unknown, string>([
      [1, "number"],
      ["1", "string"],
    ]),
  );

  const reverseOrder = c.assign(
    new Map<unknown, string>([
      ["1", "string"],
      [1, "number"],
    ]),
  );

  assert.equal(forwardOrder.key, reverseOrder.key);
  assert.equal(forwardOrder.hash, reverseOrder.hash);
});

test("Map collisions with identical property keys produce deterministic output", () => {
  const forward = new Map<unknown, string>([
    [1, "number"],
    ["1", "string"],
  ]);
  const reverse = new Map<unknown, string>([
    ["1", "string"],
    [1, "number"],
  ]);

  assert.equal(stableStringify(forward), stableStringify(reverse));

  const c = new Cat32();
  const forwardAssignment = c.assign(forward);
  const reverseAssignment = c.assign(reverse);

  assert.equal(forwardAssignment.key, reverseAssignment.key);
  assert.equal(forwardAssignment.hash, reverseAssignment.hash);
});

test(
  "Map numeric keys remain distinct from string keys in canonical form",
  () => {
    const c = new Cat32();
    const mixedKeyMap = new Map<unknown, string>([
      [1, "number"],
      ["1", "string"],
    ]);

    const assignment = c.assign(mixedKeyMap);
    const serialized = stableStringify(mixedKeyMap);

    assert.ok(
      serialized.includes("\\u0000cat32:propertykey:"),
      "stableStringify should encode property key sentinel for numeric Map keys",
    );
    assert.ok(
      assignment.key.includes("\\u0000cat32:propertykey:"),
      "Cat32 canonical key should encode property key sentinel for numeric Map keys",
    );

    const stringOnlyAssignment = c.assign(
      new Map<string, string>([["1", "string"]]),
    );

    assert.ok(assignment.key !== stringOnlyAssignment.key);
    assert.ok(assignment.hash !== stringOnlyAssignment.hash);
  },
);

test(
  "Map bigint keys remain distinct from string keys in canonical form",
  () => {
    const c = new Cat32();
    const mixedKeyMap = new Map<unknown, string>([
      [1n, "bigint"],
      ["1", "string"],
    ]);

    const assignment = c.assign(mixedKeyMap);
    const serialized = stableStringify(mixedKeyMap);

    assert.ok(
      serialized.includes("\\u0000cat32:propertykey:"),
      "stableStringify should encode property key sentinel for bigint Map keys",
    );
    assert.ok(
      assignment.key.includes("\\u0000cat32:propertykey:"),
      "Cat32 canonical key should encode property key sentinel for bigint Map keys",
    );

    const stringOnlyAssignment = c.assign(
      new Map<string, string>([["1", "string"]]),
    );

    assert.ok(assignment.key !== stringOnlyAssignment.key);
    assert.ok(assignment.hash !== stringOnlyAssignment.hash);
  },
);

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

test("Map object key differs from plain object string key", () => {
  const obj = { foo: 1 };
  const map = new Map([[obj, "value"]]);
  const plainObject = { [String(obj)]: "value" };

  assert.ok(stableStringify(map) !== stableStringify(plainObject));

  const cat = new Cat32();
  const mapAssignment = cat.assign(map);
  const objectAssignment = cat.assign(plainObject);

  assert.ok(mapAssignment.key !== objectAssignment.key);
  assert.ok(mapAssignment.hash !== objectAssignment.hash);
});

test("Map function value matches plain object value", () => {
  const c = new Cat32();
  const fn = function foo() {};

  const mapAssignment = c.assign(new Map([["fn", fn]]));
  const objectAssignment = c.assign({ fn });

  assert.equal(mapAssignment.key, objectAssignment.key);
  assert.equal(mapAssignment.hash, objectAssignment.hash);
});

test("Map symbol value matches plain object value", () => {
  const c = new Cat32();
  const sym = Symbol("x");

  const mapAssignment = c.assign(new Map([["sym", sym]]));
  const objectAssignment = c.assign({ sym });

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

test("stableStringify accepts Map with sentinel-style string key", () => {
  const sentinelKey = "\u0000cat32:string:value\u0000";
  const map = new Map([[sentinelKey, 1]]);

  const serialized = stableStringify(map);
  const assignment = new Cat32().assign(map);

  assert.equal(assignment.key, serialized);
});

test("Infinity serialized distinctly from string sentinel", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const infinityAssignment = c.assign({ value: Infinity });
  const sentinelAssignment = c.assign({ value: "__number__:Infinity" });

  assert.equal(infinityAssignment.key === sentinelAssignment.key, false);
  assert.equal(infinityAssignment.hash === sentinelAssignment.hash, false);
});

test("raw number sentinel string remains distinct from Infinity value", () => {
  const c = new Cat32();
  const sentinelLiteral = typeSentinel("number", "Infinity");
  const sentinelAssignment = c.assign(sentinelLiteral);
  const infinityAssignment = c.assign(Infinity);

  assert.ok(sentinelAssignment.key !== infinityAssignment.key);
  assert.ok(sentinelAssignment.hash !== infinityAssignment.hash);
  assert.equal(
    sentinelAssignment.key,
    JSON.stringify(`__string__:${sentinelLiteral}`),
  );
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
  const symbolValue = Symbol("x");

  assert.equal(c.assign("foo").key, stableStringify("foo"));
  assert.equal(c.assign(1n).key, stableStringify(1n));
  assert.equal(c.assign(Number.NaN).key, stableStringify(Number.NaN));
  assert.equal(c.assign(symbolValue).key, stableStringify(symbolValue));
});

test("bigint sentinel string differs from bigint value", () => {
  const c = new Cat32();
  const bigintAssignment = c.assign(1n);
  const stringAssignment = c.assign("__bigint__:1");

  assert.ok(bigintAssignment.key !== stringAssignment.key);
  assert.ok(bigintAssignment.hash !== stringAssignment.hash);
});

test("undefined sentinel string literal differs from undefined value", () => {
  const c = new Cat32();
  const undefinedAssignment = c.assign(undefined);
  const stringAssignment = c.assign("__undefined__");

  assert.equal(undefinedAssignment.key, JSON.stringify("__undefined__"));
  assert.equal(stringAssignment.key, JSON.stringify("__string__:__undefined__"));
  assert.ok(undefinedAssignment.key !== stringAssignment.key);
  assert.ok(undefinedAssignment.hash !== stringAssignment.hash);
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

test("sentinel string literals remain distinct from actual values at top level", () => {
  const c = new Cat32();

  const bigintValue = c.assign(1n);
  const bigintSentinel = c.assign("__bigint__:1");
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign(undefined);
  const undefinedSentinel = c.assign("__undefined__");
  assert.equal(undefinedValue.key, JSON.stringify("__undefined__"));
  assert.equal(undefinedSentinel.key, JSON.stringify("__string__:__undefined__"));
  assert.ok(undefinedValue.key !== undefinedSentinel.key);
  assert.ok(undefinedValue.hash !== undefinedSentinel.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign(date);
  const dateSentinel = c.assign("__date__:" + date.toISOString());
  assert.equal(dateValue.key, JSON.stringify(`__date__:${date.toISOString()}`));
  assert.equal(
    dateSentinel.key,
    JSON.stringify(`__string__:__date__:${date.toISOString()}`),
  );
  assert.ok(dateValue.key !== dateSentinel.key);
  assert.ok(dateValue.hash !== dateSentinel.hash);
});

test("sentinel string literals match nested undefined/date but not bigint", () => {
  const c = new Cat32();

  const bigintValue = c.assign({ value: 1n });
  const bigintSentinel = c.assign({ value: "__bigint__:1" });
  assert.ok(bigintValue.key !== bigintSentinel.key);
  assert.ok(bigintValue.hash !== bigintSentinel.hash);

  const undefinedValue = c.assign({ value: undefined });
  const undefinedLiteral = c.assign({ value: "__undefined__" });
  assert.equal(undefinedValue.key, stableStringify({ value: undefined }));
  assert.equal(
    undefinedLiteral.key,
    stableStringify({ value: "__undefined__" }),
  );
  assert.ok(undefinedValue.key !== undefinedLiteral.key);
  assert.ok(undefinedValue.hash !== undefinedLiteral.hash);

  const date = new Date("2024-01-02T03:04:05.678Z");
  const dateValue = c.assign({ value: date });
  const dateLiteral = c.assign({ value: "__date__:" + date.toISOString() });
  assert.equal(dateValue.key, stableStringify({ value: date }));
  assert.equal(
    dateLiteral.key,
    stableStringify({ value: "__date__:" + date.toISOString() }),
  );
  assert.ok(dateValue.key !== dateLiteral.key);
  assert.ok(dateValue.hash !== dateLiteral.hash);
});

test("date object property serializes with sentinel", () => {
  const c = new Cat32();
  const date = new Date("2024-01-02T03:04:05.678Z");
  const assignment = c.assign({ value: date });

  assert.equal(assignment.key, stableStringify({ value: date }));
});

test("cyclic object throws", () => {
  const a: { x: number; self?: unknown } = { x: 1 };
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

test("map payload remains distinct from plain object with numeric keys", () => {
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
  assert.ok(
    mapAssignment.key.includes("\\u0000cat32:propertykey:"),
    "Map numeric keys should carry property key sentinels",
  );
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

test("CLI spawn reads piped stdin when TTY without argv key", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const distCliPath = new URL("../cli.js", import.meta.url).pathname;
  const script = [
    "const path = process.argv.at(-1);",
    "Object.defineProperty(process.stdin, 'isTTY', { configurable: true, writable: true, value: true });",
    "process.stdin.isTTY = true;",
    "process.argv = [process.argv[0], path];",
    "import(path).catch((err) => { console.error(err); process.exit(1); });",
  ].join(" ");
  const child = spawn(process.argv[0], ["-e", script, distCliPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.write("tty-spawn\n");
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

  const result = JSON.parse(stdout) as { key: string; hash: string };
  const expected = new Cat32().assign("tty-spawn");
  assert.equal(result.key, expected.key);
  assert.equal(result.hash, expected.hash);
});

test("CLI reads stdin even when TTY without argv key", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const script = [
    "const path = process.argv.at(-1);",
    "process.stdin.isTTY = true;",
    "process.argv = [process.argv[0], path];",
    "import(path).catch((err) => { console.error(err); process.exit(1); });",
  ].join(" ");
  const child = spawn(process.argv[0], ["-e", script, CLI_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.write("tty-stdin\n");
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
  const expected = new Cat32().assign("tty-stdin");
  assert.equal(result.key, expected.key);
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

test("CLI outputs compact JSON by default", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "default-json"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("default-json");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("cat32 command outputs compact JSON when --json is followed by positional input", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };

  const cat32CommandPath = import.meta.url.includes("/dist/tests/")
    ? new URL("../cli.js", import.meta.url).pathname
    : new URL("../dist/cli.js", import.meta.url).pathname;

  let command = cat32CommandPath;
  let commandArgs: string[] = ["--json", "foo"];

  try {
    const { access } = (await dynamicImport("node:fs/promises")) as {
      access(path: string, mode?: number): Promise<void>;
    };
    const { constants } = (await dynamicImport("node:fs")) as {
      constants: { X_OK: number };
    };
    await access(cat32CommandPath, constants.X_OK);
  } catch {
    command = process.argv[0];
    commandArgs = [cat32CommandPath, "--json", "foo"];
  }

  const child = spawn(command, commandArgs, {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("foo");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("CLI outputs compact JSON when --json is provided without a value", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--json", "--", "json-flag"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("json-flag");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("CLI outputs compact JSON when --json is followed by positional input", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--json", "foo"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("foo");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("CLI exits with code 2 when --json= has an invalid value", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--json=foo"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code: number | null) => resolve(code));
  });

  assert.equal(exitCode, 2);
  assert.ok(
    stderr.includes('unsupported --json value "foo"'),
    `stderr did not include unsupported --json value message: ${stderr}`,
  );
});

test("CLI outputs compact JSON when --json=compact is provided", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--json=compact", "json-flag"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("json-flag");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("CLI outputs pretty JSON when --json=pretty is provided", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--json=pretty", "json-pretty"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("json-pretty");
  assert.equal(stdout, JSON.stringify(expected, null, 2) + "\n");
});

test("CLI accepts NFKD normalization flag", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--normalize=nfkd", "Ａ"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32({ normalize: "nfkd" }).assign("A");
  assert.equal(stdout, JSON.stringify(expected) + "\n");
});

test("CLI pretty flag indents JSON output", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [CLI_PATH, "--pretty", "pretty-flag"], {
    stdio: ["ignore", "pipe", "inherit"],
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

  const expected = new Cat32().assign("pretty-flag");
  assert.equal(stdout, JSON.stringify(expected, null, 2) + "\n");
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
