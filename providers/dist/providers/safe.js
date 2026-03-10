const trimStack = (stack, lines = 6) => {
    if (!stack)
        return undefined;
    return stack.split(/\r?\n/).slice(0, lines).join('\n');
};
const normalizeError = (error) => {
    if (error instanceof Error) {
        const info = {
            message: error.message,
            name: error.name,
        };
        const stack = trimStack(error.stack);
        if (stack)
            info.stack = stack;
        return info;
    }
    return { message: String(error) };
};
export const logSafeError = (context, error) => {
    const info = normalizeError(error);
    const payload = {
        event: 'error',
        context,
        error: info.message,
        ...(info.name ? { errorName: info.name } : {}),
        ...(info.stack ? { errorStack: info.stack } : {}),
    };
    console.error(`[provider-safe] ${context}`, payload);
};
export const safe = async (_context, fn, options = {}) => {
    try {
        return await fn();
    }
    catch (error) {
        if (Object.prototype.hasOwnProperty.call(options, 'fallback')) {
            const { fallback } = options;
            if (typeof fallback === 'function')
                return fallback(error);
            return fallback;
        }
        throw error;
    }
};
export const bestEffort = async (context, fn) => {
    try {
        await fn();
    }
    catch (error) {
        logSafeError(context, error);
    }
};
