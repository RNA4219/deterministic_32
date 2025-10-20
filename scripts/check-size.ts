const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

interface ProcessLike {
  argv: string[];
  exitCode?: number;
}

declare const process: ProcessLike;

type ReadFileResult = ArrayBufferView | ArrayBuffer | string;

type ReadFileFunction = (
  path: string | URL,
) => Promise<ReadFileResult> | ReadFileResult;

type PathResolve = (...segments: string[]) => string;

type FileURLToPath = (url: string | URL) => string;

type GzipFunction = (input: ReadFileResult) => { readonly byteLength: number };

type Logger = (message: string) => void;

type Setter = (code: number) => void;

const loadFunction = async <T>(
  specifier: string,
  key: string,
  description: string,
): Promise<T> => {
  const module = (await dynamicImport(specifier)) as { [exported: string]: unknown } | null;
  if (!module || typeof module !== "object") {
    throw new TypeError(`expected ${specifier} module to be an object`);
  }
  const candidate = module[key];
  if (typeof candidate !== "function") {
    throw new TypeError(`expected ${description}`);
  }
  return candidate as T;
};

const loadReadFile = (): Promise<ReadFileFunction> =>
  loadFunction<ReadFileFunction>("node:fs/promises", "readFile", "node:fs/promises.readFile");

const loadResolve = (): Promise<PathResolve> =>
  loadFunction<PathResolve>("node:path", "resolve", "node:path.resolve");

const loadFileURLToPath = (): Promise<FileURLToPath> =>
  loadFunction<FileURLToPath>("node:url", "fileURLToPath", "node:url.fileURLToPath");

const loadGzipSync = (): Promise<GzipFunction> =>
  loadFunction<GzipFunction>("node:zlib", "gzipSync", "node:zlib.gzipSync");

export const MAX_GZIP_SIZE_BYTES = 10 * 1024;

const DEFAULT_TARGET_PATH = new URL("../index.js", import.meta.url);

export type RunCheckSizeOptions = {
  readonly targetPath?: string | URL;
  readonly maxBytes?: number;
  readonly readFile?: ReadFileFunction;
  readonly log?: Logger;
  readonly error?: Logger;
  readonly setExitCode?: Setter;
};

export type CheckSizeResult = {
  readonly gzipSize: number;
  readonly limit: number;
  readonly exceeded: boolean;
  readonly targetPath: string;
};

const textEncoder = new TextEncoder();

const toUint8Array = (value: ReadFileResult): Uint8Array => {
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

const describeTarget = async (target: string | URL): Promise<string> => {
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

const setProcessExitCode: Setter = (code) => {
  process.exitCode = code;
};

export const runCheckSize = async (
  options: RunCheckSizeOptions = {},
): Promise<CheckSizeResult> => {
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
    error(
      `[check-size] ${describedTarget} gzip size ${gzipSize} bytes exceeds limit ${maxBytes} bytes`,
    );
    setExitCode(1);
  } else {
    log(
      `[check-size] ${describedTarget} gzip size ${gzipSize} bytes within limit ${maxBytes} bytes`,
    );
  }

  return { gzipSize, limit: maxBytes, exceeded, targetPath: describedTarget };
};

const isExecutedDirectly = async (): Promise<boolean> => {
  const fileURLToPath = await loadFileURLToPath();
  const resolve = await loadResolve();
  const scriptPath = resolve(fileURLToPath(import.meta.url));
  const invokedPath = process.argv[1];
  return typeof invokedPath === "string" && invokedPath.length > 0
    ? resolve(invokedPath) === scriptPath
    : false;
};

const runCli = async (): Promise<void> => {
  try {
    await runCheckSize();
  } catch (error) {
    const message =
      error instanceof Error && typeof error.message === "string"
        ? error.message
        : String(error);
    console.error(`[check-size] failed: ${message}`);
    setProcessExitCode(1);
  }
};

const runCliIfNeeded = async (): Promise<void> => {
  if (await isExecutedDirectly()) {
    await runCli();
  }
};

void runCliIfNeeded();
