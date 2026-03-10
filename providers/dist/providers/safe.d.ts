export type SafeOptions<T> = {
    meta?: Record<string, unknown>;
    ignoreCodes?: string[];
    fallback?: T | ((error: unknown) => T);
};
export declare const logSafeError: (context: string, error: unknown) => void;
export declare const safe: <T>(_context: string, fn: () => T | Promise<T>, options?: SafeOptions<T>) => Promise<T>;
export declare const bestEffort: (context: string, fn: () => unknown | Promise<unknown>) => Promise<void>;
