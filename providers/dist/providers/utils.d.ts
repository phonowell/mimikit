import type { TokenUsage } from './token-usage.js';
export declare const newProviderId: () => string;
export declare const stripUndefined: <T extends Record<string, unknown>>(obj: T) => { [K in keyof T]: Exclude<T[K], undefined>; };
export declare const resolveHttpProxyUrl: (params: {
    proxy: string | undefined;
    onInvalidUrl: (value: string) => never;
    onInvalidProtocol: (protocol: string) => never;
}) => string | undefined;
export declare const normalizeUsage: (usage?: unknown) => TokenUsage | undefined;
