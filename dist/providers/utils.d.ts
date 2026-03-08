import type { TokenUsage } from './token-usage.js';
export declare const newProviderId: () => string;
export declare const stripUndefined: <T extends Record<string, unknown>>(obj: T) => { [K in keyof T]: Exclude<T[K], undefined>; };
export declare const normalizeUsage: (usage?: unknown) => TokenUsage | undefined;
