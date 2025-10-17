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
export declare const createRefreshQueueStore: () => RefreshQueueStore;
