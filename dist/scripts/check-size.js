const dynamicImport = new Function("specifier", "return import(specifier);");
const loadFunction = async (specifier, key, description) => {
    const module = (await dynamicImport(specifier));
    if (!module || typeof module !== "object") {
        throw new TypeError(`expected ${specifier} module to be an object`);
    }
    const candidate = module[key];
    if (typeof candidate !== "function") {
        throw new TypeError(`expected ${description}`);
    }
    return candidate;
};
const loadReadFile = () => loadFunction("node:fs/promises", "readFile", "node:fs/promises.readFile");
const loadResolve = () => loadFunction("node:path", "resolve", "node:path.resolve");
const loadFileURLToPath = () => loadFunction("node:url", "fileURLToPath", "node:url.fileURLToPath");
const loadGzipSync = () => loadFunction("node:zlib", "gzipSync", "node:zlib.gzipSync");
export const MAX_GZIP_SIZE_BYTES = 10 * 1024;
const DEFAULT_TARGET_PATH = new URL("../index.js", import.meta.url);
const textEncoder = new TextEncoder();
const toUint8Array = (value) => {
    if (typeof value === "string") {
        return textEncoder.encode(value);
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError("expected readFile to return string or ArrayBuffer view");
};
const describeTarget = async (target) => {
    if (typeof target === "string") {
        return target;
    }
    if (target instanceof URL) {
        if (target.protocol === "file:") {
            const fileURLToPath = await loadFileURLToPath();
            return fileURLToPath(target);
        }
        return target.href;
    }
    return String(target);
};
const setProcessExitCode = (code) => {
    process.exitCode = code;
};
export const runCheckSize = async (options = {}) => {
    const targetPath = options.targetPath ?? DEFAULT_TARGET_PATH;
    const maxBytes = options.maxBytes ?? MAX_GZIP_SIZE_BYTES;
    const readFile = options.readFile ?? (await loadReadFile());
    const log = options.log ?? ((message) => console.log(message));
    const error = options.error ?? ((message) => console.error(message));
    const setExitCode = options.setExitCode ?? setProcessExitCode;
    const gzipSync = await loadGzipSync();
    const rawContent = await readFile(targetPath);
    const bytes = toUint8Array(rawContent);
    const gzipSize = gzipSync(bytes).byteLength;
    const exceeded = gzipSize > maxBytes;
    const describedTarget = await describeTarget(targetPath);
    if (exceeded) {
        error(`[check-size] ${describedTarget} gzip size ${gzipSize} bytes exceeds limit ${maxBytes} bytes`);
        setExitCode(1);
    }
    else {
        log(`[check-size] ${describedTarget} gzip size ${gzipSize} bytes within limit ${maxBytes} bytes`);
    }
    return { gzipSize, limit: maxBytes, exceeded, targetPath: describedTarget };
};
const isExecutedDirectly = async () => {
    const fileURLToPath = await loadFileURLToPath();
    const resolve = await loadResolve();
    const scriptPath = resolve(fileURLToPath(import.meta.url));
    const invokedPath = process.argv[1];
    return typeof invokedPath === "string" && invokedPath.length > 0
        ? resolve(invokedPath) === scriptPath
        : false;
};
const runCli = async () => {
    try {
        await runCheckSize();
    }
    catch (error) {
        const message = error instanceof Error && typeof error.message === "string"
            ? error.message
            : String(error);
        console.error(`[check-size] failed: ${message}`);
        setProcessExitCode(1);
    }
};
const runCliIfNeeded = async () => {
    if (await isExecutedDirectly()) {
        await runCli();
    }
};
void runCliIfNeeded();
