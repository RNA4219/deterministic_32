export const retryQueueEntry = async (store, recordId, attempt) => {
    const record = store.get(recordId);
    if (!record) {
        throw new Error(`Unknown refresh queue entry: ${recordId}`);
    }
    store.recordAttempt(recordId);
    try {
        const result = await attempt();
        store.recordSuccess(recordId);
        return result;
    }
    catch (error) {
        store.recordFailure(recordId, error);
        throw error;
    }
};
