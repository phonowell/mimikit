import type { TokenUsage } from './token-usage.js';
import type { OpenAiResponsesProviderRequest, Provider } from './types.js';
export declare const parseResponsesSse: (raw: string) => {
    output: string;
    usage?: TokenUsage;
};
export declare const parseResponsesJson: (raw: string) => {
    output: string;
    usage?: TokenUsage;
};
export declare const parseResponsesPayload: (raw: string) => {
    output: string;
    usage?: TokenUsage;
};
export declare const openAiResponsesProvider: Provider<OpenAiResponsesProviderRequest>;
