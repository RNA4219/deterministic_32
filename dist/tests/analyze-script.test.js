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
const DATA_EVENT_LOG_CONTENT = [
    { type: "test:pass", data: { name: "suite::alpha", status: "pass", duration_ms: 200 } },
    { type: "test:fail", data: { name: "suite::beta", status: "fail", duration_ms: 400 } },
]
    .map((entry) => JSON.stringify(entry))
    .join("\n")
    .concat("\n");
const DATA_WRAPPED_LOG_CONTENT = [
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
        await writeFile(logPath, DATA_EVENT_LOG_CONTENT, { encoding: "utf8" });
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
test("analyze.py は非テストイベントを集計に含めない", async () => {
    const { execFile } = (await dynamicImport("node:child_process"));
    const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises"));
    const { join } = (await dynamicImport("node:path"));
    const repoRootPath = process.cwd();
    const logPath = join(repoRootPath, "logs", "test.jsonl");
    const reportPath = join(repoRootPath, "reports", "today.md");
    const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
    const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
    try {
        await writeFile(logPath, LOG_WITH_DIAGNOSTIC_CONTENT, { encoding: "utf8" });
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
        assert.ok(report.includes("- Total tests: 2"), "非テストイベントを除外すれば件数は 2 のはず");
        assert.ok(report.includes("- Pass rate: 50.00%"), "1 件失敗なら成功率は 50% のはず");
        assert.ok(report.includes("- Duration p95: 195 ms"), "診断イベントを除外すれば p95 は 195 ms のはず");
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
test("analyze.py は data.data のようなラップ構造から値を抽出する", async () => {
    const { execFile } = (await dynamicImport("node:child_process"));
    const { readFile, rm, writeFile } = (await dynamicImport("node:fs/promises"));
    const { join } = (await dynamicImport("node:path"));
    const repoRootPath = process.cwd();
    const logPath = join(repoRootPath, "logs", "test.jsonl");
    const reportPath = join(repoRootPath, "reports", "today.md");
    const originalLog = await readFile(logPath, { encoding: "utf8" }).catch(() => null);
    const originalReport = await readFile(reportPath, { encoding: "utf8" }).catch(() => null);
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
        assert.ok(report.includes("- Total tests: 2"), "ラップ構造でも件数は 2 のはず");
        assert.ok(report.includes("- Pass rate: 50.00%"), "1 件失敗なら成功率は 50% のはず");
        assert.ok(report.includes("- Duration p95: 145 ms"), "ラップ構造でも p95 は 145 ms のはず");
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
