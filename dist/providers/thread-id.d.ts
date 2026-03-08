export declare const attachProviderThreadId: <TError extends Error>(error: TError, threadId: string | null | undefined) => TError;
export declare const readProviderThreadId: (error: unknown) => string | undefined;
