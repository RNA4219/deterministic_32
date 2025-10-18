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
  mkdir(path: string, options: { recursive?: boolean }): Promise<void>;
};

type ProcessLike = {
  cwd(): string;
  env: Record<string, string | undefined>;
};

type PathModule = {
  join(...segments: string[]): string;
};

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const DATA_WRAPPED_LOG_CONTENT = `${JSON.stringify({
  name: "sample::single",
  status: "pass",
  data: { duration_ms: 150 },
})}\n`;

const LOG_WITH_DIAGNOSTIC_CONTENT =
  `${JSON.stringify({
    name: "sample::pass",
    status: "pass",
    duration_ms: 100,
  })}\n` +
  `${JSON.stringify({
    name: "sample::fail",
    status: "fail",
    duration_ms: 200,
  })}\n` +
  `${JSON.stringify({
    type: "test:diagnostic",
    data: { message: "informational" },
  })}\n`;

const DATA_WRAPPED_LOG_CONTENT =
  [
    {
      type: "test:pass",
      data: { data: { name: "sample::wrapped-pass", duration_ms: 50 } },
    },
    {
      type: "test:fail",
      data: { data: { name: "sample::wrapped-fail", duration_ms: 150 } },
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n")
    .concat("\n");

test("analyze.py はサンプルが少なくても p95 を計算できる", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { mkdir, readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;

  const envProcess = process as unknown as ProcessLike;
  const repoRootPath = envProcess.cwd();
  const { env } = envProcess;

  const logDirectory = join(repoRootPath, "logs");
  const reportDirectory = join(repoRootPath, "reports");
  await Promise.all([
    mkdir(logDirectory, { recursive: true }),
    mkdir(reportDirectory, { recursive: true }),
  ]);

  const logPath = join(logDirectory, "test.analyze.jsonl");
  const reportPath = join(reportDirectory, "today.analyze.md");
  const issuePath = join(reportDirectory, "issue.analyze.md");

  const originalEnv = {
    ANALYZE_LOG_PATH: env.ANALYZE_LOG_PATH,
    ANALYZE_REPORT_PATH: env.ANALYZE_REPORT_PATH,
    ANALYZE_ISSUE_PATH: env.ANALYZE_ISSUE_PATH,
  };

  const setEnv = (key: keyof typeof originalEnv, value: string | undefined) => {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  };

  setEnv("ANALYZE_LOG_PATH", logPath);
  setEnv("ANALYZE_REPORT_PATH", reportPath);
  setEnv("ANALYZE_ISSUE_PATH", issuePath);

  try {
    await Promise.all([
      rm(logPath, { force: true }),
      rm(reportPath, { force: true }),
      rm(issuePath, { force: true }),
    ]);

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
    assert.ok(report.includes("Duration p95: 150 ms"), "p95 がログの値と一致するはず");
  } finally {
    setEnv("ANALYZE_LOG_PATH", originalEnv.ANALYZE_LOG_PATH);
    setEnv("ANALYZE_REPORT_PATH", originalEnv.ANALYZE_REPORT_PATH);
    setEnv("ANALYZE_ISSUE_PATH", originalEnv.ANALYZE_ISSUE_PATH);

    await Promise.all([
      rm(logPath, { force: true }),
      rm(reportPath, { force: true }),
      rm(issuePath, { force: true }),
    ]);
  }
});

test("analyze.py は非テストイベントを集計に含めない", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = join(repoRootPath, "logs", "test.jsonl");
  const reportPath = join(repoRootPath, "reports", "today.md");

  const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
  const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);

  try {
    await writeFile(logPath, LOG_WITH_DIAGNOSTIC_CONTENT, { encoding: "utf8" });

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
    assert.ok(report.includes("- Total tests: 2"), "非テストイベントを除外すれば件数は 2 のはず");
    assert.ok(report.includes("- Pass rate: 50.00%"), "1 件失敗なら成功率は 50% のはず");
    assert.ok(report.includes("- Duration p95: 195 ms"), "診断イベントを除外すれば p95 は 195 ms のはず");
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
  }
});

test("analyze.py は data.data のようなラップ構造から値を抽出する", async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const { join } = (await dynamicImport("node:path")) as PathModule;
  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = join(repoRootPath, "logs", "test.jsonl");
  const reportPath = join(repoRootPath, "reports", "today.md");
  const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
  const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
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
    assert.ok(report.includes("- Total tests: 2"), "ラップ構造でも件数は 2 のはず");
    assert.ok(report.includes("- Pass rate: 50.00%"), "1 件失敗なら成功率は 50% のはず");
    assert.ok(report.includes("- Duration p95: 145 ms"), "ラップ構造でも p95 は 145 ms のはず");
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
  }
});
