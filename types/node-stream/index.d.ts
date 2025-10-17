declare module "node:stream" {
  export type TransformCallback = (error: Error | null, data?: string) => void;

  export class Transform {
    constructor(options?: { writableObjectMode?: boolean });
    on(event: string, listener: (...args: unknown[]) => void): void;
    write(chunk: unknown): void;
    end(): void;
    _transform(chunk: unknown, encoding: string, callback: TransformCallback): void;
  }
}
