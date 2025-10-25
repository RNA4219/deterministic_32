import test from "node:test";
import assert from "node:assert/strict";

type FsPromisesModule = { readFile(path: string, encoding: "utf8"): Promise<string> };

function sortNumbers(values: Iterable<number>): number[] {
  return Array.from(values).sort((a, b) => a - b);
}

const dynamicImport = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<unknown>;

const isDist = import.meta.url.includes("/dist/tests/");
const distUrl = new URL(isDist ? "../" : "../dist/", import.meta.url);
const projectUrl = new URL("../", distUrl);
const cliDocPath = new URL("./docs/CLI.md", projectUrl).pathname;
const cliSourcePath = new URL("./src/cli.ts", projectUrl).pathname;

test("CLI documented exit codes match implementation", async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const doc = await readFile(cliDocPath, "utf8");
  const source = await readFile(cliSourcePath, "utf8");

  const docExitCodes = new Set(
    Array.from(doc.matchAll(/^- `(?<code>\d+)`/gmu))
      .map(({ groups }) => Number(groups?.code))
      .filter((code): code is number => Number.isInteger(code)),
  );

  assert.ok(docExitCodes.size > 0, "docs should list at least one exit code");
  assert.ok(
    doc.includes("RangeError"),
    "docs should describe how RangeError is handled for CLI exit codes",
  );

  const exitCodeMappingMatch = source.match(
    /const exitCode = isSpecificationViolation\(error\) \? (?<violation>\d+) : (?<general>\d+);/u,
  );

  if (exitCodeMappingMatch === null || exitCodeMappingMatch.groups === undefined) {
    throw new Error("cli.ts should map specification violations to explicit exit codes");
  }

  const groups = exitCodeMappingMatch.groups as { violation: string; general: string };
  const violationCode = Number(groups.violation);
  const generalCode = Number(groups.general);
  const implementationExitCodes = new Set([0, violationCode, generalCode]);

  assert.deepEqual(
    sortNumbers(docExitCodes),
    sortNumbers(implementationExitCodes),
    `docs exit codes must match implementation (RangeError should exit with ${violationCode})`,
  );

  assert.ok(
    !docExitCodes.has(3),
    "docs must not advertise an exit code 3 for RangeError or other cases",
  );
});
