import type { RefreshQueueStore } from "./sw/refreshQueueStore.js";
export type RetryAttempt<TResult = unknown> = () => TResult | PromiseLike<TResult>;
export declare const retryQueueEntry: <T>(store: RefreshQueueStore, recordId: string, attempt: RetryAttempt<T>) => Promise<T>;
