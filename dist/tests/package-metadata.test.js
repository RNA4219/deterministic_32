import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
test("package.json exposes a TypeScript dev dependency", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonUrl, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    const { devDependencies } = packageJson;
    assert.ok(devDependencies && typeof devDependencies.typescript === "string", "expected package.json to declare TypeScript in devDependencies");
    const version = devDependencies.typescript.trim();
    assert.ok(version !== "", "expected TypeScript version to be non-empty");
});
