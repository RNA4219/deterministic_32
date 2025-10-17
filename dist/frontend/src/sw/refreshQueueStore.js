let nextId = 0;
const createRecord = (request) => ({
    id: `${Date.now().toString(36)}-${(nextId++).toString(36)}`,
    request: request.clone(),
    enqueuedAt: new Date(),
    attempts: 0,
});
export const createRefreshQueueStore = () => {
    const records = new Map();
    const enqueue = (request) => {
        const record = createRecord(request);
        records.set(record.id, record);
        return record;
    };
    const get = (id) => records.get(id);
    const recordAttempt = (id) => {
        const record = records.get(id);
        if (!record) {
            return;
        }
        record.attempts += 1;
        record.lastAttemptedAt = new Date();
    };
    const recordFailure = (id, error) => {
        const record = records.get(id);
        if (!record) {
            return;
        }
        record.failedAt = new Date();
        record.lastError = error;
    };
    const recordSuccess = (id) => {
        records.delete(id);
    };
    return {
        enqueue,
        get,
        recordAttempt,
        recordFailure,
        recordSuccess,
    };
};
