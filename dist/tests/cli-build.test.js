import assert from "node:assert";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const runTest = test;
runTest("dist cli build embeds resolveOutputFormat logic", { timeout: 60_000 }, async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const repoRootUrl = new URL("../..", import.meta.url);
    const cliDistUrl = new URL("dist/src/cli.js", repoRootUrl);
    const cliOutput = await readFile(cliDistUrl, { encoding: "utf8" });
    assert.ok(/function resolveOutputFormat\(args\)/.test(cliOutput));
    assert.ok(/const jsonOption = typeof args\.json === "string" \? args\.json : undefined;/.test(cliOutput));
    assert.ok(/if \(jsonOption === "compact" \|\| jsonOption === "pretty"\) {\s+if \(prettyFlag\) {\s+return "pretty";\s+}\s+return jsonOption;\s+}/s.test(cliOutput));
    assert.ok(/return prettyFlag \? "pretty" : "compact";/.test(cliOutput));
});
