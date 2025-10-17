export const retryQueueEntry = async (store, recordId, attempt) => {
    store.recordAttempt(recordId);
    try {
        await attempt();
        store.recordSuccess(recordId);
    }
    catch (error) {
        store.recordFailure(recordId, error);
        throw error;
    }
};
