import assert from "node:assert/strict";
import test from "node:test";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; encoding?: string },
  callback: ExecFileCallback,
) => void;

type FsPromisesModule = {
  readFile(path: string, options: { encoding: "utf8" }): Promise<string>;
  writeFile(path: string, data: string, options: { encoding: "utf8" }): Promise<void>;
  rm(path: string, options: { force?: boolean }): Promise<void>;
};

type PathModule = {
  join(...segments: string[]): string;
};

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const TEST_LOG_CONTENT = `${JSON.stringify({
  type: "test:pass",
  data: {
    name: "sample::single",
    status: "pass",
    duration_ms: 150,
  },
})}\n`;

const DATA_WRAPPED_LOG_CONTENT =
  [
    { type: "test:pass", data: { name: "suite::alpha", status: "pass", duration_ms: 200 } },
    { type: "test:fail", data: { name: "suite::beta", status: "fail", duration_ms: 400 } },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n") + "\n";

const PASS_FAIL_MINIMAL_LOG_CONTENT =
  [
    { type: "test:pass", data: { name: "ok", duration_ms: 5 } },
    { type: "test:fail", data: { name: "ng", duration_ms: 7 } },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n") + "\n";

test("analyze.py はサンプルが少なくても p95 を計算できる", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = join(repoRootPath, "logs", "test.jsonl");
  const reportPath = join(repoRootPath, "reports", "today.md");
  const issuePath = join(repoRootPath, "reports", "issue_suggestions.md");

  const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
  const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
  const originalIssue = await readFile(issuePath, { encoding: "utf8" }).catch(() => null);

  try {
    await writeFile(logPath, TEST_LOG_CONTENT, { encoding: "utf8" });

    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        ["scripts/analyze.py"],
        { cwd: repoRootPath, encoding: "utf8" },
        (error: Error | null, _stdout: string, stderr: string) => {
          if (error) {
            const message =
              stderr.length > 0 ? `analyze.py failed: ${stderr}` : "analyze.py exited with a non-zero status";
            reject(new Error(message, { cause: error }));
            return;
          }
          resolve();
        },
      );
    });

    const report = await readFile(reportPath, { encoding: "utf8" });
    assert.ok(report.includes("Duration p95: 150 ms"), "p95 がログの値と一致するはず");
  } finally {
    if (originalLog === null) {
      await rm(logPath, { force: true });
    } else {
      await writeFile(logPath, originalLog, { encoding: "utf8" });
    }

    if (originalReport === null) {
      await rm(reportPath, { force: true });
    } else {
      await writeFile(reportPath, originalReport, { encoding: "utf8" });
    }

    if (originalIssue === null) {
      await rm(issuePath, { force: true });
    } else {
      await writeFile(issuePath, originalIssue, { encoding: "utf8" });
    }
  }
});

test("analyze.py は fail 1 件を含むサマリを生成できる", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = join(repoRootPath, "logs", "test.jsonl");
  const reportPath = join(repoRootPath, "reports", "today.md");
  const issuePath = join(repoRootPath, "reports", "issue_suggestions.md");

  const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
  const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
  const originalIssue = await readFile(issuePath, { encoding: "utf8" }).catch(() => null);

  try {
    await writeFile(logPath, PASS_FAIL_MINIMAL_LOG_CONTENT, { encoding: "utf8" });

    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        ["scripts/analyze.py"],
        { cwd: repoRootPath, encoding: "utf8" },
        (error: Error | null, _stdout: string, stderr: string) => {
          if (error) {
            const message =
              stderr.length > 0 ? `analyze.py failed: ${stderr}` : "analyze.py exited with a non-zero status";
            reject(new Error(message, { cause: error }));
            return;
          }
          resolve();
        },
      );
    });

    const report = await readFile(reportPath, { encoding: "utf8" });
    assert.ok(report.includes("- Total tests: 2"), "合計件数が 2 件のはず");
    assert.ok(report.includes("- Failures: 1"), "失敗件数が 1 件のはず");
    const p95Match = report.match(/- Duration p95: (\d+) ms/);
    if (p95Match === null) {
      throw new Error("p95 行が存在するはず");
    }
    const p95Value = Number(p95Match[1]);
    assert.ok(Number.isFinite(p95Value), "p95 は数値のはず");
    assert.ok(p95Value >= 7, "p95 は 7 以上のはず");
  } finally {
    if (originalLog === null) {
      await rm(logPath, { force: true });
    } else {
      await writeFile(logPath, originalLog, { encoding: "utf8" });
    }

    if (originalReport === null) {
      await rm(reportPath, { force: true });
    } else {
      await writeFile(reportPath, originalReport, { encoding: "utf8" });
    }

    if (originalIssue === null) {
      await rm(issuePath, { force: true });
    } else {
      await writeFile(issuePath, originalIssue, { encoding: "utf8" });
    }
  }
});

test("analyze.py は data フィールド内の情報を集計できる", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = join(repoRootPath, "logs", "test.jsonl");
  const reportPath = join(repoRootPath, "reports", "today.md");
  const issuePath = join(repoRootPath, "reports", "issue_suggestions.md");

  const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
  const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
  const originalIssue = await readFile(issuePath, { encoding: "utf8" }).catch(() => null);

  try {
    await writeFile(logPath, DATA_WRAPPED_LOG_CONTENT, { encoding: "utf8" });

    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        ["scripts/analyze.py"],
        { cwd: repoRootPath, encoding: "utf8" },
        (error: Error | null, _stdout: string, stderr: string) => {
          if (error) {
            const message =
              stderr.length > 0 ? `analyze.py failed: ${stderr}` : "analyze.py exited with a non-zero status";
            reject(new Error(message, { cause: error }));
            return;
          }
          resolve();
        },
      );
    });

    const report = await readFile(reportPath, { encoding: "utf8" });
    assert.ok(report.includes("- Total tests: 2"), "data フィールドのテスト件数を集計できるはず");
    assert.ok(report.includes("- Pass rate: 50.00%"), "pass/fail が集計できるはず");
    assert.ok(report.includes("- Duration p95: 390 ms"), "duration を集計できるはず");
  } finally {
    if (originalLog === null) {
      await rm(logPath, { force: true });
    } else {
      await writeFile(logPath, originalLog, { encoding: "utf8" });
    }

    if (originalReport === null) {
      await rm(reportPath, { force: true });
    } else {
      await writeFile(reportPath, originalReport, { encoding: "utf8" });
    }

    if (originalIssue === null) {
      await rm(issuePath, { force: true });
    } else {
      await writeFile(issuePath, originalIssue, { encoding: "utf8" });
    }
  }
});
