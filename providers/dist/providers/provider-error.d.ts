type ProviderErrorCode = 'provider_timeout' | 'provider_aborted' | 'provider_preflight_failed' | 'provider_circuit_open' | 'provider_transient_network' | 'provider_sdk_failure';
export declare class ProviderError extends Error {
    readonly code: ProviderErrorCode;
    readonly retryable: boolean;
    constructor(params: {
        code: ProviderErrorCode;
        message: string;
        retryable: boolean;
    });
}
export declare const buildProviderTimeoutError: (providerId: string, timeoutMs: number) => ProviderError;
export declare const buildProviderAbortedError: (providerId: string) => ProviderError;
export declare const buildProviderCircuitOpenError: (providerId: string) => ProviderError;
export declare const buildProviderSdkError: (params: {
    providerId: string;
    message: string;
    transient: boolean;
}) => ProviderError;
export declare const buildProviderPreflightError: (params: {
    providerId: string;
    message: string;
}) => ProviderError;
export declare const readProviderErrorCode: (error: unknown) => ProviderErrorCode | undefined;
export declare const isTransientProviderMessage: (message: string) => boolean;
export {};
