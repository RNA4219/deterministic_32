declare namespace NodeJS {
  interface Readable {
    isTTY?: boolean;
    setEncoding(encoding: string): void;
    on(event: "data", listener: (chunk: string) => void): void;
    on(event: "end", listener: () => void): void;
  }

  interface Writable {
    write(data: string): void;
  }

  interface Process {
    argv: string[];
    stdin: Readable;
    stdout: Writable;
    exit(code?: number): never;
  }
}

declare const process: NodeJS.Process;

declare module "node:assert" {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): asserts value;
    throws(
      block: () => unknown,
      error?: RegExp | ((err: unknown) => boolean),
      message?: string | Error
    ): void;
  }

  const assert: Assert;
  export default assert;
  export const equal: Assert["equal"];
  export const ok: Assert["ok"];
  export const throws: Assert["throws"];
}

declare module "node:test" {
  type TestImplementation = () => Promise<void> | void;
  type TestOptions = {
    readonly timeout?: number;
    readonly skip?: boolean;
    readonly only?: boolean;
    readonly concurrency?: boolean | number;
  };
  type TestFunction = (name: string, fn: TestImplementation, options?: TestOptions) => Promise<void>;
  const test: TestFunction & {
    only: TestFunction;
    skip: TestFunction;
  };
  export default test;
}
