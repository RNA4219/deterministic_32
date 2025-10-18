import type { RefreshQueueStore } from "./sw/refreshQueueStore.js";

export type RetryAttempt = () => unknown | PromiseLike<unknown>;

export const retryQueueEntry = async (
  store: RefreshQueueStore,
  recordId: string,
  attempt: RetryAttempt,
): Promise<void> => {
  store.recordAttempt(recordId);
  try {
    await attempt();
    store.recordSuccess(recordId);
  } catch (error) {
    store.recordFailure(recordId, error);
    throw error;
  }
};
