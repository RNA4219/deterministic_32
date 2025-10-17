import type { RefreshQueueStore } from "./sw/refreshQueueStore.js";
export type RetryAttempt = () => Promise<void>;
export declare const retryQueueEntry: (store: RefreshQueueStore, recordId: string, attempt: RetryAttempt) => Promise<void>;
