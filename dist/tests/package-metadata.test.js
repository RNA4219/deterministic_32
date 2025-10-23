import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const expectedBenchScript = "npm run build && node dist/scripts/bench.js";
const requiredLintGlobs = [
    "src/**/*.ts",
    "tests/**/*.ts",
    "frontend/**/*.ts",
    "frontend/src/**/*.ts",
    "frontend/tests/**/*.ts",
];
test("package.json exposes a TypeScript dev dependency", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonUrl, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    const { devDependencies } = packageJson;
    assert.ok(devDependencies && typeof devDependencies.typescript === "string", "expected package.json to declare TypeScript in devDependencies");
    const version = devDependencies.typescript.trim();
    assert.equal(version, "5.9.3", "expected TypeScript version to be pinned to 5.9.3");
});
test("package.json declares a bench script targeting the compiled bench entry", async () => {
    const { access, constants, readFile } = (await dynamicImport("node:fs/promises"));
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonUrl, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    assert.ok(packageJson.scripts && typeof packageJson.scripts.bench === "string", "expected package.json to declare a bench script");
    const benchScript = packageJson.scripts.bench.trim();
    assert.equal(benchScript, expectedBenchScript, "expected bench script to execute the compiled bench entry");
    const benchSourceUrl = new URL("../../scripts/bench.ts", import.meta.url);
    await access(benchSourceUrl, constants.R_OK);
});
test("lint configuration covers frontend TypeScript sources and tests", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonUrl, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    assert.ok(packageJson.scripts && typeof packageJson.scripts.lint === "string", "expected package.json to declare a lint script");
    const lintScript = packageJson.scripts.lint.trim();
    for (const glob of requiredLintGlobs) {
        assert.ok(lintScript.includes(glob), `expected lint script to include the glob ${glob}`);
    }
    const configModule = (await dynamicImport("../../eslint.config.js"));
    assert.ok(Array.isArray(configModule.default), "expected eslint.config.js to export an array");
    const configEntries = configModule.default;
    const lintingEntry = configEntries.find((entry) => Array.isArray(entry.files) && entry.files.length > 0);
    assert.ok(lintingEntry, "expected eslint.config.js to declare a files list for linting");
    for (const glob of requiredLintGlobs) {
        assert.ok(lintingEntry.files.includes(glob), `expected eslint.config.js to include the glob ${glob}`);
    }
});
