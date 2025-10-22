declare module "node:assert/promises" {
  export function rejects(
    value: unknown,
    message?: string | Error | ((error: unknown) => boolean),
  ): Promise<void>;
  export function doesNotReject(
    value: unknown,
    message?: string | Error | ((error: unknown) => boolean),
  ): Promise<void>;
}
