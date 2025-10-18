import assert from "node:assert/strict";
import test from "node:test";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

type ChildProcessModule = {
  execFile(
    file: string,
    args: readonly string[],
    options: { cwd?: string; encoding?: string },
    callback: ExecFileCallback,
  ): void;
};

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
) as <T>(specifier: string) => Promise<T>;

const readOptional = async (
  module: FsPromisesModule,
  filePath: string,
): Promise<string | null> => {
  try {
    return await module.readFile(filePath, { encoding: "utf8" });
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      const { code } = error as { code?: unknown };
      if (code === "ENOENT") {
        return null;
      }
    }
    throw error;
  }
};

const restoreFile = async (
  module: FsPromisesModule,
  filePath: string,
  content: string | null,
) => {
  if (content === null) {
    await module.rm(filePath, { force: true });
    return;
  }

  await module.writeFile(filePath, content, { encoding: "utf8" });
};

const runAnalyze = (
  childProcess: ChildProcessModule,
  repoRootPath: string,
) =>
  new Promise<void>((resolve, reject) => {
    childProcess.execFile(
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

const TEST_LOG_CONTENT = `${JSON.stringify({
  name: "sample::single",
  status: "pass",
  duration_ms: 150,
})}\n`;

test("analyze.py はサンプルが少なくても p95 を計算できる", async () => {
  const childProcess = await dynamicImport<ChildProcessModule>("node:child_process");
  const fs = await dynamicImport<FsPromisesModule>("node:fs/promises");
  const path = await dynamicImport<PathModule>("node:path");

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = path.join(repoRootPath, "logs", "test.jsonl");
  const reportPath = path.join(repoRootPath, "reports", "today.md");

  const originalLog = await readOptional(fs, logPath);
  const originalReport = await readOptional(fs, reportPath);

  try {
    await fs.writeFile(logPath, TEST_LOG_CONTENT, { encoding: "utf8" });
    await runAnalyze(childProcess, repoRootPath);

    const report = await fs.readFile(reportPath, { encoding: "utf8" });
    assert.ok(report.includes("Duration p95: 150 ms"), "p95 がログの値と一致するはず");
  } finally {
    await restoreFile(fs, logPath, originalLog);
    await restoreFile(fs, reportPath, originalReport);
  }
});

test("analyze.py はテストが 0 件でも合計と成功率を正しく扱う", async () => {
  const childProcess = await dynamicImport<ChildProcessModule>("node:child_process");
  const fs = await dynamicImport<FsPromisesModule>("node:fs/promises");
  const path = await dynamicImport<PathModule>("node:path");

  const repoRootPath = (process as unknown as { cwd(): string }).cwd();
  const logPath = path.join(repoRootPath, "logs", "test.jsonl");
  const reportPath = path.join(repoRootPath, "reports", "today.md");

  const originalLog = await readOptional(fs, logPath);
  const originalReport = await readOptional(fs, reportPath);

  try {
    await fs.writeFile(logPath, "", { encoding: "utf8" });
    await runAnalyze(childProcess, repoRootPath);

    const report = await fs.readFile(reportPath, { encoding: "utf8" });
    assert.ok(report.includes("- Total tests: 0"), "テスト件数は 0 のはず");
    assert.ok(report.includes("- Pass rate: 0.00%"), "成功率は 0% のはず");
  } finally {
    await restoreFile(fs, logPath, originalLog);
    await restoreFile(fs, reportPath, originalReport);
  }
});
