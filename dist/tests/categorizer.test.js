// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";
const dynamicImport = new Function("specifier", "return import(specifier);");
const CLI_PATH = new URL("../src/cli.js", import.meta.url).pathname;
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
async function runCliAssignWithSet(values) {
    const { spawn } = (await dynamicImport("node:child_process"));
    const baseEnv = process.env ?? {};
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
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 0);
    return JSON.parse(stdout);
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
    assert.equal(assignment.key, "{\"value\":\"__undefined__\"}");
});
test("canonical key encodes date sentinel", () => {
    const c = new Cat32();
    const date = new Date("2024-01-02T03:04:05.000Z");
    const assignment = c.assign({ value: date });
    assert.equal(assignment.key, `{"value":"__date__:${date.toISOString()}"}`);
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
test("override rejects NaN with explicit error", () => {
    assert.throws(() => new Cat32({ overrides: { foo: Number.NaN } }), (error) => error instanceof Error && error.message === "index out of range: NaN");
});
test("override rejects NaN", () => {
    assert.throws(() => new Cat32({ overrides: { foo: Number.NaN } }), (error) => error instanceof Error);
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
test("unsupported normalization option throws", () => {
    assert.throws(() => new Cat32({ normalize: "nfkd" }), (error) => error instanceof RangeError);
});
test("bigint values serialize deterministically", () => {
    const c = new Cat32({ salt: "s", namespace: "ns" });
    const input = {
        value: 123n,
        nested: { arr: [1n, { deep: 2n }] },
    };
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
test("Map keys match plain object representation regardless of entry order", () => {
    const c = new Cat32();
    const map = new Map([
        ["10", 10],
        ["2", 2],
    ]);
    const mapAssignment = c.assign(map);
    const objectAssignment = c.assign({ 2: 2, 10: 10 });
    assert.equal(mapAssignment.key, objectAssignment.key);
    assert.equal(mapAssignment.hash, objectAssignment.hash);
    const reorderedMapAssignment = c.assign(new Map([
        ["2", 2],
        ["10", 10],
    ]));
    const reorderedObjectAssignment = c.assign({ 10: 10, 2: 2 });
    assert.equal(reorderedMapAssignment.key, objectAssignment.key);
    assert.equal(reorderedMapAssignment.hash, objectAssignment.hash);
    assert.equal(reorderedObjectAssignment.key, objectAssignment.key);
    assert.equal(reorderedObjectAssignment.hash, objectAssignment.hash);
    const duplicateKeyMapAssignment = c.assign(new Map([
        [0, "same"],
        ["0", "same"],
    ]));
    const duplicateKeyObjectAssignment = c.assign({ 0: "same" });
    assert.equal(duplicateKeyMapAssignment.key, duplicateKeyObjectAssignment.key);
    assert.equal(duplicateKeyMapAssignment.hash, duplicateKeyObjectAssignment.hash);
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
test("top-level undefined serializes with sentinel string", () => {
    const assignment = new Cat32().assign(undefined);
    assert.equal(assignment.key, JSON.stringify("__undefined__"));
});
test("undefined object property serializes with sentinel", () => {
    const c = new Cat32();
    const assignment = c.assign({ value: undefined });
    assert.equal(assignment.key, '{"value":"__undefined__"}');
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
test("date object property serializes with sentinel", () => {
    const c = new Cat32();
    const date = new Date("2024-01-02T03:04:05.678Z");
    const assignment = c.assign({ value: date });
    assert.equal(assignment.key, '{"value":"__date__:2024-01-02T03:04:05.678Z"}');
});
test("cyclic object throws", () => {
    const a = { x: 1 };
    a.self = a;
    const c = new Cat32();
    assert.throws(() => c.assign(a), /Cyclic object/);
});
test("map object key differs from same-name string key", () => {
    const c = new Cat32();
    const objectKey = { foo: 1 };
    const stringKey = String(objectKey);
    const inputWithObjectKey = {
        payload: new Map([
            [objectKey, "object"],
            [stringKey, "string"],
        ]),
    };
    const inputWithStringKey = {
        payload: new Map([
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
        payload: new Map([
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
    let distModule;
    try {
        distModule = (await import(new URL("../dist/src/categorizer.js", import.meta.url)));
    }
    catch (error) {
        const maybeModuleNotFound = error;
        if (maybeModuleNotFound.code !== "ERR_MODULE_NOT_FOUND") {
            throw error;
        }
        const normalizedHref = distModuleUrl.href.replace("/dist/dist/", "/dist/");
        distModule = (await import(normalizedHref));
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
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CLI_PATH], {
        stdio: ["pipe", "pipe", "inherit"],
    });
    child.stdin.write("  spaced\n");
    child.stdin.end();
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.key, "  spaced");
    const expected = new Cat32().assign("  spaced");
    assert.equal(result.hash, expected.hash);
});
test("CLI handles empty string key from argv", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
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
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.key, "");
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
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CLI_PATH, ""], {
        stdio: ["pipe", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.key, "");
    const expected = new Cat32().assign("");
    assert.equal(result.hash, expected.hash);
});
test("CLI exits with code 2 for invalid normalize option using stdin", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CLI_PATH, "--normalize=invalid"], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 2);
});
test("CLI exits with code 2 for invalid normalize option", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CLI_PATH, "foo", "--normalize=invalid"], {
        stdio: ["pipe", "pipe", "inherit"],
    });
    child.stdin.end();
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 2);
});
test("CLI exits with code 2 when override label error is thrown", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
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
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 2);
});
test("CLI exits with code 2 when override label is missing", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
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
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    assert.equal(exitCode, 2);
});
test("CODEOWNERS gate resolves review decision fallback", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const yaml = await readFile(new URL("../../.github/workflows/pr_gate.yml", import.meta.url), "utf8");
    const lines = yaml.split("\n");
    const scriptIndex = lines.findIndex((line) => line.includes("script: |"));
    assert.ok(scriptIndex >= 0, "workflow script block not found");
    const trimmedLines = [];
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
    const startIndex = trimmedLines.findIndex((line) => line.startsWith("function resolveReviewDecision"));
    assert.ok(startIndex >= 0, "resolveReviewDecision not defined in workflow script");
    const functionLines = [];
    for (let i = startIndex, depth = 0; i < trimmedLines.length; i += 1) {
        const line = trimmedLines[i];
        if (line.length === 0)
            continue;
        functionLines.push(line);
        for (const char of line) {
            if (char === "{")
                depth += 1;
            else if (char === "}")
                depth -= 1;
        }
        if (depth <= 0 && i > startIndex)
            break;
    }
    assert.ok(functionLines.at(-1)?.trim() === "}", "resolveReviewDecision not defined in workflow script");
    const functionSource = functionLines.join("\n");
    const resolver = new Function(`${functionSource}\nreturn resolveReviewDecision;`)();
    assert.equal(resolver(undefined, ["APPROVED"]), "APPROVED");
    assert.equal(resolver(null, ["APPROVED", "CHANGES_REQUESTED"]), "CHANGES_REQUESTED");
    assert.equal(resolver("review_required", []), "REVIEW_REQUIRED");
    assert.equal(resolver(undefined, []), "REVIEW_REQUIRED");
});
