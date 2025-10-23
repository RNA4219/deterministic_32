type ReadFileResult = ArrayBufferView | ArrayBuffer | string;
type ReadFileFunction = (path: string | URL) => Promise<ReadFileResult> | ReadFileResult;
type Logger = (message: string) => void;
type Setter = (code: number) => void;
export declare const MAX_GZIP_SIZE_BYTES: number;
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
export declare const runCheckSize: (options?: RunCheckSizeOptions) => Promise<CheckSizeResult>;
export {};
