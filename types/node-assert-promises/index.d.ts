declare module "node:assert/promises" {
  export function rejects(
    block: (() => unknown) | Promise<unknown>,
    error?: unknown,
    message?: string,
  ): Promise<void>;
}
