import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const expectedBenchScript = "npm run build && node dist/scripts/bench.js";

test("package.json exposes a TypeScript dev dependency", async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile: (path: string | URL, options: "utf8") => Promise<string>;
  };

  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJsonContent = await readFile(packageJsonUrl, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as {
    devDependencies?: Record<string, unknown>;
  };

  const { devDependencies } = packageJson;
  assert.ok(
    devDependencies && typeof devDependencies.typescript === "string",
    "expected package.json to declare TypeScript in devDependencies",
  );

  const version = (devDependencies!.typescript as string).trim();
  assert.equal(
    version,
    "5.9.3",
    "expected TypeScript version to be pinned to 5.9.3",
  );
});

test("package.json declares a bench script targeting the compiled bench entry", async () => {
  const { access, constants, readFile } = (await dynamicImport(
    "node:fs/promises",
  )) as {
    access: (path: string | URL, mode?: number) => Promise<void>;
    constants: { R_OK: number };
    readFile: (path: string | URL, options: "utf8") => Promise<string>;
  };

  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJsonContent = await readFile(packageJsonUrl, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as {
    scripts?: Record<string, unknown>;
  };

  assert.ok(
    packageJson.scripts && typeof packageJson.scripts.bench === "string",
    "expected package.json to declare a bench script",
  );

  const benchScript = (packageJson.scripts!.bench as string).trim();
  assert.equal(
    benchScript,
    expectedBenchScript,
    "expected bench script to execute the compiled bench entry",
  );

  const benchSourceUrl = new URL("../../scripts/bench.ts", import.meta.url);
  await access(benchSourceUrl, constants.R_OK);
});
