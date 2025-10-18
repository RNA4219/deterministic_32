import type { RefreshQueueStore } from "./sw/refreshQueueStore.js";

export type RetryAttempt<TResult = unknown> = () => TResult | PromiseLike<TResult>;

export const retryQueueEntry = async <T>(
  store: RefreshQueueStore,
  recordId: string,
  attempt: RetryAttempt<T>,
): Promise<T> => {
  store.recordAttempt(recordId);
  try {
    const result = await attempt();
    store.recordSuccess(recordId);
    return result;
  } catch (error) {
    store.recordFailure(recordId, error);
    throw error;
  }
};
