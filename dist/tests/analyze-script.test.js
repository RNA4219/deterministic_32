import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const TEST_LOG_CONTENT = `${JSON.stringify({
    name: "sample::single",
    status: "pass",
    duration_ms: 150,
})}\n`;
const LOG_WITH_DIAGNOSTIC_CONTENT = `${JSON.stringify({
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
const PASS_ONLY_LOG_CONTENT = `${JSON.stringify({
    type: "test:pass",
    data: { name: "recovered", duration_ms: 10 },
})}\n`;
const DATA_WRAPPED_LOG_CONTENT = [
    { type: "test:pass", data: { name: "suite::alpha", status: "pass", duration_ms: 200 } },
    { type: "test:fail", data: { name: "suite::beta", status: "fail", duration_ms: 400 } },
]
    .map((entry) => JSON.stringify(entry))
    .join("\n") + "\n";
const EMPTY_LOG_CONTENT = "";
test("analyze.py はサンプルが少なくても p95 を計算できる", async () => {
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
        if (originalIssue === null) {
            await rm(issuePath, { force: true });
        }
        else {
            await writeFile(issuePath, originalIssue, { encoding: "utf8" });
        }
    }
});
test("analyze.py は失敗後に成功すると issue_suggestions.md を片付ける", async () => {
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
        await writeFile(logPath, LOG_WITH_DIAGNOSTIC_CONTENT, { encoding: "utf8" });
        await runAnalyze();
        const issueReportAfterFailure = await readFile(issuePath, { encoding: "utf8" });
        assert.ok(issueReportAfterFailure.includes("- [ ]"), "失敗時は issue_suggestions.md が生成されるはず");
        await writeFile(logPath, PASS_ONLY_LOG_CONTENT, { encoding: "utf8" });
        await runAnalyze();
        const issueReportAfterSuccess = await readFile(issuePath, { encoding: "utf8" }).catch((error) => {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (issueReportAfterSuccess !== null) {
            assert.equal(issueReportAfterSuccess.trim(), "", "成功時は issue_suggestions.md が空になるはず");
        }
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
test("analyze.py は data フィールド内の情報を集計できる", async () => {
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
    try {
        await writeFile(logPath, DATA_WRAPPED_LOG_CONTENT, { encoding: "utf8" });
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
        assert.ok(report.includes("- Total tests: 2"), "data フィールドのテスト件数を集計できるはず");
        assert.ok(report.includes("- Pass rate: 50.00%"), "pass/fail が集計できるはず");
        assert.ok(report.includes("- Duration p95: 390 ms"), "duration を集計できるはず");
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
test("analyze.py はテストが存在しない場合に 0 件として集計する", async () => {
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
    try {
        await writeFile(logPath, EMPTY_LOG_CONTENT, { encoding: "utf8" });
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
        assert.ok(report.includes("- Total tests: 0"), "テスト件数が 0 と表示されるはず");
        assert.ok(report.includes("- Pass rate: 0.00%"), "テストがない場合はパス率 0% と表示されるはず");
        assert.ok(report.includes("- Duration p95: 0 ms"), "テストがない場合は p95 が 0 と表示されるはず");
        assert.ok(report.includes("- Failures: 0"), "テストがない場合は失敗数が 0 と表示されるはず");
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
