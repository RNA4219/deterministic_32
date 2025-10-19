import type { RetryAttempt } from "../../src/sw.js";
import { retryQueueEntry } from "../../src/sw.js";
import type { RefreshQueueStore } from "../../src/sw/refreshQueueStore.js";

const acceptsPromiseReturningValue: RetryAttempt = async () => {
  return "ok";
};

const acceptsSynchronousValue: RetryAttempt = () => "ok";

const assertRetryQueueEntryResult = async (store: RefreshQueueStore) => {
  const promiseResult: Promise<string> = retryQueueEntry(store, "record", async () => "ok");
  const syncResult: Promise<string> = retryQueueEntry(store, "record", () => "ok");

  return { promiseResult, syncResult };
};

void acceptsPromiseReturningValue;
void acceptsSynchronousValue;
void assertRetryQueueEntryResult;
