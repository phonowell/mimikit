const PROVIDER_ERROR_CODE_SET = new Set([
    'provider_timeout',
    'provider_aborted',
    'provider_preflight_failed',
    'provider_circuit_open',
    'provider_transient_network',
    'provider_sdk_failure',
]);
export class ProviderError extends Error {
    code;
    retryable;
    constructor(params) {
        super(params.message);
        this.name = 'ProviderError';
        this.code = params.code;
        this.retryable = params.retryable;
    }
}
const providerTag = (providerId) => `[provider:${providerId}]`;
const normalizeProviderErrorMessage = (params) => {
    const normalized = params.message.trim();
    const prefix = providerTag(params.providerId);
    if (normalized.startsWith(prefix))
        return normalized;
    return `${prefix} ${params.label}: ${normalized}`;
};
export const buildProviderTimeoutError = (providerId, timeoutMs) => new ProviderError({
    code: 'provider_timeout',
    message: `${providerTag(providerId)} timed out after ${timeoutMs}ms`,
    retryable: true,
});
export const buildProviderAbortedError = (providerId) => new ProviderError({
    code: 'provider_aborted',
    message: `${providerTag(providerId)} aborted`,
    retryable: false,
});
export const buildProviderCircuitOpenError = (providerId) => new ProviderError({
    code: 'provider_circuit_open',
    message: `${providerTag(providerId)} circuit is open`,
    retryable: true,
});
export const buildProviderSdkError = (params) => new ProviderError({
    code: params.transient
        ? 'provider_transient_network'
        : 'provider_sdk_failure',
    message: normalizeProviderErrorMessage({
        providerId: params.providerId,
        message: params.message,
        label: 'sdk run failed',
    }),
    retryable: params.transient,
});
export const buildProviderPreflightError = (params) => new ProviderError({
    code: 'provider_preflight_failed',
    message: normalizeProviderErrorMessage({
        providerId: params.providerId,
        message: params.message,
        label: 'preflight failed',
    }),
    retryable: false,
});
export const readProviderErrorCode = (error) => {
    if (error instanceof ProviderError)
        return error.code;
    if (!error || typeof error !== 'object')
        return undefined;
    const maybeCode = error['code'];
    if (typeof maybeCode !== 'string')
        return undefined;
    return PROVIDER_ERROR_CODE_SET.has(maybeCode)
        ? maybeCode
        : undefined;
};
const TRANSIENT_PROVIDER_MESSAGE_PATTERNS = [
    /fetch failed/i,
    /socket hang up/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /EAI_AGAIN/i,
    /ETIMEDOUT/i,
    /timed out/i,
    /network/i,
];
export const isTransientProviderMessage = (message) => TRANSIENT_PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
