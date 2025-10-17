import assert from "node:assert";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const EXPECTED_SNIPPETS = [
  "function resolveOutputFormat(args) {",
  "const jsonOption = typeof args.json === \"string\" ? args.json : undefined;",
  "const prettyFlag = args.pretty === true;",
  "if (jsonOption === undefined) {",
  "return prettyFlag ? \"pretty\" : \"compact\";",
  "if (jsonOption === \"compact\" || jsonOption === \"pretty\") {",
  "if (prettyFlag) {",
  "return jsonOption;",
  "throw new RangeError(`unsupported --json value \"${jsonOption}\"`);",
] as const;

test("dist CLI build contains resolveOutputFormat logic", async () => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile: (path: string, encoding: "utf8") => Promise<string>;
  };

  const isBuiltTest = import.meta.url.includes("/dist/tests/");
  const distDirUrl = isBuiltTest
    ? new URL("..", import.meta.url)
    : new URL("../dist/", import.meta.url);

  const targets = [
    { description: "dist/src/cli.js", url: new URL("src/cli.js", distDirUrl) },
    { description: "dist/cli.js", url: new URL("cli.js", distDirUrl) },
  ] as const;

  for (const target of targets) {
    const distCliPath = fileURLToPath(target.url);
    const cliSource = await readFile(distCliPath, "utf8");

    for (const snippet of EXPECTED_SNIPPETS) {
      assert.ok(
        cliSource.includes(snippet),
        `expected to find ${JSON.stringify(snippet)} in ${target.description}`,
      );
    }
  }
});
