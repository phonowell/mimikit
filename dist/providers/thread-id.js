const PROVIDER_THREAD_ID_SYMBOL = Symbol.for('mimikit.provider_thread_id');
const normalizeThreadId = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const asRecord = (value) => typeof value === 'object' && value
    ? value
    : undefined;
export const attachProviderThreadId = (error, threadId) => {
    const normalized = normalizeThreadId(threadId);
    if (!normalized)
        return error;
    Object.defineProperty(error, PROVIDER_THREAD_ID_SYMBOL, {
        value: normalized,
        configurable: true,
        enumerable: false,
        writable: false,
    });
    return error;
};
export const readProviderThreadId = (error) => {
    const record = asRecord(error);
    if (!record)
        return undefined;
    return (normalizeThreadId(record[PROVIDER_THREAD_ID_SYMBOL]) ??
        normalizeThreadId(record.threadId));
};
