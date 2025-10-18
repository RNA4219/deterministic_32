import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const TEST_LOG_CONTENT = `${JSON.stringify({
    name: "sample::single",
    status: "pass",
    duration_ms: 150,
})}\n`;
const FAILURE_LOG_CONTENT = `${JSON.stringify({
    name: "sample::failure",
    status: "fail",
    duration_ms: 200,
})}\n`;
test("analyze.py はサンプルが少なくても p95 を計算できる", async () => {
    const { execFile } = (await dynamicImport("node:child_process"));
    const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises"));
    const { join } = (await dynamicImport("node:path"));
    const repoRootPath = process.cwd();
    const logPath = join(repoRootPath, "logs", "test.jsonl");
    const reportPath = join(repoRootPath, "reports", "today.md");
    const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
    const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
    try {
        await writeFile(logPath, TEST_LOG_CONTENT, { encoding: "utf8" });
        await new Promise((resolve, reject) => {
            execFile("python3", ["scripts/analyze.py"], { cwd: repoRootPath, encoding: "utf8" }, (error, _stdout, stderr) => {
                if (error) {
                    const message = stderr.length > 0 ? `analyze.py failed: ${stderr}` : "analyze.py exited with a non-zero status";
                    reject(new Error(message, { cause: error }));
                    return;
                }
                resolve();
            });
        });
        const report = await readFile(reportPath, { encoding: "utf8" });
        assert.ok(report.includes("Duration p95: 150 ms"), "p95 がログの値と一致するはず");
    }
    finally {
        if (originalLog === null) {
            await rm(logPath, { force: true });
        }
        else {
            await writeFile(logPath, originalLog, { encoding: "utf8" });
        }
        if (originalReport === null) {
            await rm(reportPath, { force: true });
        }
        else {
            await writeFile(reportPath, originalReport, { encoding: "utf8" });
        }
    }
});
test("analyze.py は失敗ログ処理後に issue_suggestions.md をクリーンアップする", async () => {
    const { execFile } = (await dynamicImport("node:child_process"));
    const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises"));
    const { join } = (await dynamicImport("node:path"));
    const repoRootPath = process.cwd();
    const logPath = join(repoRootPath, "logs", "test.jsonl");
    const reportPath = join(repoRootPath, "reports", "today.md");
    const issuePath = join(repoRootPath, "reports", "issue_suggestions.md");
    const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
    const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
    const originalIssue = await readFile(issuePath, { encoding: "utf8" }).catch(() => null);
    const runAnalyze = () => new Promise((resolve, reject) => {
        execFile("python3", ["scripts/analyze.py"], { cwd: repoRootPath, encoding: "utf8" }, (error, _stdout, stderr) => {
            if (error) {
                const message = stderr.length > 0 ? `analyze.py failed: ${stderr}` : "analyze.py exited with a non-zero status";
                reject(new Error(message, { cause: error }));
                return;
            }
            resolve();
        });
    });
    try {
        await writeFile(logPath, FAILURE_LOG_CONTENT, { encoding: "utf8" });
        await runAnalyze();
        const issueReportAfterFailure = await readFile(issuePath, { encoding: "utf8" });
        assert.ok(issueReportAfterFailure.includes("- [ ] sample::failure"), "失敗ログ実行後は TODO が出力されるはず");
        await writeFile(logPath, TEST_LOG_CONTENT, { encoding: "utf8" });
        await runAnalyze();
        const issueReportAfterSuccess = await readFile(issuePath, { encoding: "utf8" })
            .then((content) => content)
            .catch((error) => {
            if (error !== null &&
                typeof error === "object" &&
                "code" in error &&
                typeof error.code === "string" &&
                error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        assert.ok(issueReportAfterSuccess === null || issueReportAfterSuccess.trim().length === 0, "成功時には issue_suggestions.md が削除または空になるはず");
    }
    finally {
        if (originalLog === null) {
            await rm(logPath, { force: true });
        }
        else {
            await writeFile(logPath, originalLog, { encoding: "utf8" });
        }
        if (originalReport === null) {
            await rm(reportPath, { force: true });
        }
        else {
            await writeFile(reportPath, originalReport, { encoding: "utf8" });
        }
        if (originalIssue === null) {
            await rm(issuePath, { force: true });
        }
        else {
            await writeFile(issuePath, originalIssue, { encoding: "utf8" });
        }
    }
});
