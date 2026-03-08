import type { ModelReasoningEffort } from '@openai/codex-sdk';
export type CodexSettings = {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    wireApi?: string;
    requiresAuth?: boolean;
};
export declare const DEFAULT_MODEL_REASONING_EFFORT: ModelReasoningEffort;
export declare const loadCodexSettings: () => Promise<CodexSettings>;
