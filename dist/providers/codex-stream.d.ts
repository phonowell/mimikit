import { normalizeUsage } from './utils.js';
import type { CodexSdkProviderRequest } from './types.js';
type CodexThread = {
    runStreamed: (prompt: string, options: {
        outputSchema?: unknown;
        signal: AbortSignal;
    }) => Promise<{
        events: AsyncIterable<unknown>;
    }>;
    id?: string | null;
};
export type StreamResult = {
    output: string;
    usage?: ReturnType<typeof normalizeUsage>;
};
export declare const runCodexStream: (thread: CodexThread, request: CodexSdkProviderRequest, signal: AbortSignal, resetIdle: () => void) => Promise<StreamResult>;
export {};
