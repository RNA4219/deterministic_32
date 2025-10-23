import { retryQueueEntry } from "../../src/sw.js";
const acceptsPromiseReturningValue = async () => {
    return "ok";
};
const acceptsSynchronousValue = () => "ok";
const assertRetryQueueEntryResult = async (store) => {
    const promiseResult = retryQueueEntry(store, "record", async () => "ok");
    const syncResult = retryQueueEntry(store, "record", () => "ok");
    return { promiseResult, syncResult };
};
void acceptsPromiseReturningValue;
void acceptsSynchronousValue;
void assertRetryQueueEntryResult;
