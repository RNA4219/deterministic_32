import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const expectedBenchScript = "npm run build && node dist/scripts/bench.js";
const requiredLintGlobs = [
  "src/**/*.ts",
  "tests/**/*.ts",
  "frontend/src/**/*.ts",
  "frontend/tests/**/*.ts",
];

const expectedLintGlobs = requiredLintGlobs.map((glob) => `"${glob}"`);

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

test("package.json lint script includes frontend TypeScript sources", async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile: (path: string | URL, options: "utf8") => Promise<string>;
  };

  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJsonContent = await readFile(packageJsonUrl, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as {
    scripts?: Record<string, unknown>;
  };

  assert.ok(
    packageJson.scripts && typeof packageJson.scripts.lint === "string",
    "expected package.json to declare a lint script",
  );

  const lintScript = (packageJson.scripts!.lint as string).trim();
  for (const glob of expectedLintGlobs) {
    assert.ok(
      lintScript.includes(glob),
      `expected lint script to include ${glob}`,
    );
  }
});

test("eslint config covers frontend TypeScript sources", async () => {
  const configModule = (await dynamicImport("../../eslint.config.js")) as {
    default: unknown;
  };

  const config = configModule.default;
  assert.ok(Array.isArray(config), "expected eslint config to be an array");

  const typedConfig = config as Array<{ files?: unknown }>;
  const lintingEntry = typedConfig.find((entry) => Array.isArray(entry.files));

  assert.ok(lintingEntry, "expected eslint config to define file globs");

  const files = lintingEntry!.files as unknown[];
  for (const glob of requiredLintGlobs) {
    assert.ok(
      files.includes(glob),
      `expected eslint config to include ${glob}`,
    );
  }
});
