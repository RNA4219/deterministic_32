export type RefreshQueueRecord = {
  readonly id: string;
  readonly request: Request;
  readonly enqueuedAt: Date;
  attempts: number;
  lastAttemptedAt?: Date;
  failedAt?: Date;
  lastError?: unknown;
};

export type RefreshQueueStore = {
  enqueue(request: Request): RefreshQueueRecord;
  get(id: string): RefreshQueueRecord | undefined;
  recordAttempt(id: string): void;
  recordFailure(id: string, error: unknown): void;
  recordSuccess(id: string): void;
};

let nextId = 0;

const createRecord = (request: Request): RefreshQueueRecord => ({
  id: `${Date.now().toString(36)}-${(nextId++).toString(36)}`,
  request,
  enqueuedAt: new Date(),
  attempts: 0,
});

export const createRefreshQueueStore = (): RefreshQueueStore => {
  const records = new Map<string, RefreshQueueRecord>();

  const enqueue = (request: Request): RefreshQueueRecord => {
    const record = createRecord(request);
    records.set(record.id, record);
    return record;
  };

  const get = (id: string): RefreshQueueRecord | undefined => records.get(id);

  const recordAttempt = (id: string): void => {
    const record = records.get(id);
    if (!record) {
      return;
    }
    record.attempts += 1;
    record.lastAttemptedAt = new Date();
  };

  const recordFailure = (id: string, error: unknown): void => {
    const record = records.get(id);
    if (!record) {
      return;
    }
    record.failedAt = new Date();
    record.lastError = error;
  };

  const recordSuccess = (id: string): void => {
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
