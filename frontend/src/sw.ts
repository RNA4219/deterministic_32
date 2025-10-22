import type { RefreshQueueStore } from "./sw/refreshQueueStore.js";

export type RetryAttempt<TResult = unknown> = () => TResult | PromiseLike<TResult>;

export const retryQueueEntry = async <T>(
  store: RefreshQueueStore,
  recordId: string,
  attempt: RetryAttempt<T>,
): Promise<T> => {
  const record = store.get(recordId);
  if (!record) {
    throw new Error(`Unknown refresh queue entry: ${recordId}`);
  }
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
