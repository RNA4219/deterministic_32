import assert from "node:assert";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const EXPECTED_SNIPPETS = [
    "function resolveOutputFormat(args) {",
    "const jsonOption = typeof args.json === \"string\" ? args.json : undefined;",
    "const prettyFlag = args.pretty === true;",
    "return prettyFlag ? \"pretty\" : \"compact\";",
    "throw new RangeError(`unsupported --json value \"${jsonOption}\"`);",
];
test("dist CLI build contains resolveOutputFormat logic", async () => {
    const { fileURLToPath } = (await dynamicImport("node:url"));
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const distCliUrl = import.meta.url.includes("/dist/tests/")
        ? new URL("../src/cli.js", import.meta.url)
        : new URL("../dist/src/cli.js", import.meta.url);
    const distCliPath = fileURLToPath(distCliUrl);
    const cliSource = await readFile(distCliPath, "utf8");
    for (const snippet of EXPECTED_SNIPPETS) {
        assert.ok(cliSource.includes(snippet), `expected to find ${JSON.stringify(snippet)} in dist/src/cli.js`);
    }
});
