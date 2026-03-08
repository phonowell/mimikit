import type { TokenUsage } from './token-usage.js';
import type { ProviderResult } from './types.js';
export declare const elapsedMsSince: (startedAt: number) => number;
export declare const bindExternalAbort: (params: {
    controller: AbortController;
    abortSignal?: AbortSignal;
    onAbort?: () => void;
}) => (() => void);
export declare const createTimeoutGuard: (params: {
    controller: AbortController;
    timeoutMs: number;
    onTimeout?: () => void;
}) => {
    arm: () => void;
    clear: () => void;
};
export declare const buildProviderResult: (params: {
    startedAt: number;
    output: string;
    usage?: TokenUsage;
    threadId?: string | null;
}) => ProviderResult;
