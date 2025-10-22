declare module "node:assert/promises" {
  export function rejects(
    value: unknown,
    error?: unknown,
    message?: string,
  ): Promise<void>;
}
