import type { ProviderError } from './provider-error.js';
import type { CodexSdkProviderRequest } from './types.js';
import type { Codex } from '@openai/codex-sdk';
export declare const approvalPolicy: "never";
export declare const sandboxModeFor: (role: CodexSdkProviderRequest["role"]) => "danger-full-access" | "read-only";
export declare const appendCodexLlmLog: (request: CodexSdkProviderRequest, entry: Record<string, unknown>) => Promise<void>;
export declare const buildCodexProviderError: (params: {
    error: Error;
    timeoutMs: number;
    timedOut: boolean;
    externallyAborted: boolean;
}) => ProviderError;
export declare const createCodexThread: (codex: Codex, request: CodexSdkProviderRequest) => {
    thread: import("@openai/codex-sdk").Thread;
    modelReasoningEffort: import("@openai/codex-sdk").ModelReasoningEffort;
};
