import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const collectTestRelativePaths = async (readdir, join, directoryUrl, relativeBase) => {
    const entries = await readdir(directoryUrl, { withFileTypes: true });
    const collected = [];
    for (const entry of entries) {
        if (entry.name.startsWith("."))
            continue;
        const entryRelativePath = join(relativeBase, entry.name);
        if (entry.isDirectory()) {
            collected.push(...(await collectTestRelativePaths(readdir, join, new URL(`${entry.name}/`, directoryUrl), entryRelativePath)));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".test.ts"))
            collected.push(entryRelativePath);
    }
    return collected;
};
const ensureExists = async (access, fileUrl) => access(fileUrl)
    .then(() => true)
    .catch((error) => {
    if (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT") {
        return false;
    }
    throw error;
});
test("build emits compiled artifacts for every TypeScript test", async () => {
    const { readdir, access } = (await dynamicImport("node:fs/promises"));
    const { posix } = (await dynamicImport("node:path"));
    const testsDirUrl = new URL("./", import.meta.url);
    const repoRootUrl = new URL("..", testsDirUrl);
    const testRelativePaths = await collectTestRelativePaths(readdir, posix.join, testsDirUrl, "");
    const missingArtifacts = [];
    for (const testRelativePath of testRelativePaths) {
        const distRelativePath = posix.join("dist", "tests", testRelativePath.replace(/\.ts$/u, ".js"));
        if (!(await ensureExists(access, new URL(distRelativePath, repoRootUrl)))) {
            missingArtifacts.push(distRelativePath);
        }
    }
    assert.deepStrictEqual(missingArtifacts, [], missingArtifacts.length > 0
        ? `missing compiled test artifacts:\n${missingArtifacts.join("\n")}`
        : "expected all test artifacts to be present");
});
