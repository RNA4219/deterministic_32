import test from "node:test";
import assert from "node:assert/strict";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

type FsModule = {
  mkdir(path: string | URL, options: { recursive: boolean }): Promise<void>;
  writeFile(path: string | URL, data: string, encoding: string): Promise<void>;
  readFile(path: string | URL, encoding: string): Promise<string>;
  rm(path: string | URL, options: { force: boolean }): Promise<void>;
};

type SpawnSync = (
  command: string,
  args: string[],
  options: { cwd?: string; encoding?: string },
) => { status: number | null; stderr: string };

const ROOT_DIR = import.meta.url.includes("/dist/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);
const LOG_FILE = new URL("logs/test.jsonl", ROOT_DIR);
const REPORT_FILE = new URL("reports/today.md", ROOT_DIR);
const ISSUE_FILE = new URL("reports/issue_suggestions.md", ROOT_DIR);

async function resetFiles(fs: FsModule) {
  await fs.mkdir(new URL("logs", ROOT_DIR), { recursive: true });
  await fs.mkdir(new URL("reports", ROOT_DIR), { recursive: true });
  await Promise.all([
    fs.rm(LOG_FILE, { force: true }),
    fs.rm(REPORT_FILE, { force: true }),
    fs.rm(ISSUE_FILE, { force: true }),
  ]);
}

test("analyze.py aggregates pass/fail counts from reporter output", async () => {
  const { mkdir, readFile, rm, writeFile } =
    (await dynamicImport("node:fs/promises")) as FsModule;
  const { spawnSync } = (await dynamicImport("node:child_process")) as {
    spawnSync: SpawnSync;
  };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath(url: URL): string;
  };

  await resetFiles({ mkdir, rm, writeFile, readFile });

  const payloads = [
    { type: "test:pass", data: { name: "foo", duration_ms: 7 } },
    { type: "test:fail", data: { name: "bar", duration_ms: 5 } },
  ];

  await writeFile(
    LOG_FILE,
    `${payloads.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  const result = spawnSync("python3", ["scripts/analyze.py"], {
    cwd: fileURLToPath(ROOT_DIR),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);

  const report = await readFile(REPORT_FILE, "utf8");

  assert.ok(report.includes("- Total tests: 2"));
  assert.ok(report.includes("- Failures: 1"));

  const passRateMatch = report.match(/- Pass rate: ([0-9.]+)%/);
  if (!passRateMatch) {
    throw new Error("pass rate should be reported");
  }
  const [, passRate] = passRateMatch;
  assert.equal(passRate, "50.00");

  const p95Match = report.match(/- Duration p95: (\d+) ms/);
  if (!p95Match) {
    throw new Error("p95 should be reported");
  }
  const [, durationP95] = p95Match;
  assert.ok(Number(durationP95) >= 7);

  await resetFiles({ mkdir, rm, writeFile, readFile });

  const singlePayload = [{
    type: "test:pass",
    data: { name: "solo", duration_ms: 11 },
  }];

  await writeFile(
    LOG_FILE,
    `${singlePayload.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  const secondRun = spawnSync("python3", ["scripts/analyze.py"], {
    cwd: fileURLToPath(ROOT_DIR),
    encoding: "utf8",
  });

  assert.equal(secondRun.status, 0, secondRun.stderr);

  const singleReport = await readFile(REPORT_FILE, "utf8");
  const singleP95 = singleReport.match(/- Duration p95: (\d+) ms/);
  if (!singleP95) {
    throw new Error("p95 should be reported for single entry");
  }
  const [, singleDuration] = singleP95;
  assert.equal(singleDuration, "11");
});
