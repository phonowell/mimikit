export const newProviderId = () => crypto.randomUUID().replace(/-/g, '');
export const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
export const resolveHttpProxyUrl = (params) => {
    const trimmed = params.proxy?.trim();
    if (!trimmed)
        return undefined;
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return params.onInvalidUrl(trimmed);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return params.onInvalidProtocol(parsed.protocol);
    return parsed.toString();
};
const asNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const normalizeUsageParts = (parts) => {
    const input = asNumber(parts.input);
    const output = asNumber(parts.output);
    const inputCacheRead = asNumber(parts.inputCacheRead);
    const inputCacheWrite = asNumber(parts.inputCacheWrite);
    const outputCache = asNumber(parts.outputCache);
    const total = asNumber(parts.total);
    const sessionTotal = asNumber(parts.sessionTotal);
    if (input === undefined &&
        output === undefined &&
        inputCacheRead === undefined &&
        inputCacheWrite === undefined &&
        outputCache === undefined &&
        total === undefined &&
        sessionTotal === undefined)
        return undefined;
    const result = {};
    if (input !== undefined)
        result.input = input;
    if (output !== undefined)
        result.output = output;
    if (inputCacheRead !== undefined)
        result.inputCacheRead = inputCacheRead;
    if (inputCacheWrite !== undefined)
        result.inputCacheWrite = inputCacheWrite;
    if (outputCache !== undefined)
        result.outputCache = outputCache;
    if (total !== undefined)
        result.total = total;
    else if (input !== undefined && output !== undefined)
        result.total = input + output;
    if (sessionTotal !== undefined)
        result.sessionTotal = sessionTotal;
    return result;
};
const asRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    return value;
};
export const normalizeUsage = (usage) => {
    const record = asRecord(usage);
    if (!record)
        return undefined;
    const inputDetails = asRecord(record.input_tokens_details ?? record.prompt_tokens_details);
    const outputDetails = asRecord(record.output_tokens_details ?? record.completion_tokens_details);
    return normalizeUsageParts({
        input: record.input_tokens ?? record.prompt_tokens,
        inputCacheRead: record.cached_input_tokens ?? inputDetails?.cached_tokens,
        inputCacheWrite: record.cache_write_input_tokens ??
            inputDetails?.cache_creation_tokens ??
            inputDetails?.cache_write_tokens,
        output: record.output_tokens ?? record.completion_tokens,
        outputCache: record.cached_output_tokens ?? outputDetails?.cached_tokens,
        total: record.total_tokens,
        sessionTotal: record.session_total_tokens,
    });
};
