import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const loadGzipSync = async () => {
    const module = (await dynamicImport("node:zlib"));
    if (!module || typeof module !== "object") {
        throw new TypeError("expected node:zlib module to be an object");
    }
    const { gzipSync } = module;
    if (typeof gzipSync !== "function") {
        throw new TypeError("expected node:zlib module to provide gzipSync");
    }
    return gzipSync;
};
const repoRootUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../..", import.meta.url)
    : new URL("..", import.meta.url);
const scriptModuleUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("dist/scripts/check-size.js", repoRootUrl)
    : new URL("scripts/check-size.ts", repoRootUrl);
const loadModule = async () => {
    return (await dynamicImport(scriptModuleUrl.href));
};
const createPseudoRandomBytes = (length) => {
    const buffer = new Uint8Array(length);
    let state = 0x12345678;
    for (let index = 0; index < length; index += 1) {
        state = (state * 1664525 + 1013904223) & 0xffffffff;
        buffer[index] = (state >>> 24) & 0xff;
    }
    return buffer;
};
test("runCheckSize reports an error when gzip size exceeds the limit", async () => {
    const { runCheckSize, MAX_GZIP_SIZE_BYTES } = await loadModule();
    const gzipSync = await loadGzipSync();
    const content = createPseudoRandomBytes(MAX_GZIP_SIZE_BYTES + 512);
    const expectedGzipSize = gzipSync(content).byteLength;
    const capturedLogs = [];
    const capturedErrors = [];
    let exitCode;
    const result = await runCheckSize({
        readFile: async () => content,
        log: (message) => {
            capturedLogs.push(message);
        },
        error: (message) => {
            capturedErrors.push(message);
        },
        setExitCode: (code) => {
            exitCode = code;
        },
        targetPath: new URL("file:///tmp/dist/index.js"),
    });
    assert.equal(result.gzipSize, expectedGzipSize);
    assert.equal(result.limit, MAX_GZIP_SIZE_BYTES);
    assert.equal(result.exceeded, true);
    assert.equal(exitCode, 1);
    assert.deepEqual(capturedLogs, []);
    assert.ok(capturedErrors.some((line) => line.includes("dist/index.js") && line.includes(`${expectedGzipSize}`)), "expected error output to include the target path and gzip size");
});
test("runCheckSize logs success when gzip size is within the limit", async () => {
    const { runCheckSize, MAX_GZIP_SIZE_BYTES } = await loadModule();
    const gzipSync = await loadGzipSync();
    const textEncoder = new TextEncoder();
    const content = textEncoder.encode("export const value = 1;\n".repeat(4));
    const expectedGzipSize = gzipSync(content).byteLength;
    const capturedLogs = [];
    const capturedErrors = [];
    let exitCode;
    const result = await runCheckSize({
        readFile: async () => content,
        log: (message) => {
            capturedLogs.push(message);
        },
        error: (message) => {
            capturedErrors.push(message);
        },
        setExitCode: (code) => {
            exitCode = code;
        },
        targetPath: new URL("file:///tmp/dist/index.js"),
    });
    assert.equal(result.gzipSize, expectedGzipSize);
    assert.equal(result.limit, MAX_GZIP_SIZE_BYTES);
    assert.equal(result.exceeded, false);
    assert.equal(exitCode, undefined);
    assert.deepEqual(capturedErrors, []);
    assert.ok(capturedLogs.some((line) => line.includes("dist/index.js") && line.includes(`${expectedGzipSize}`)), "expected log output to include the target path and gzip size");
});
