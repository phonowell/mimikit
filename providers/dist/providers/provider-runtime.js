export const elapsedMsSince = (startedAt) => Math.max(0, Date.now() - startedAt);
export const bindExternalAbort = (params) => {
    const { abortSignal, controller, onAbort } = params;
    if (!abortSignal)
        return () => undefined;
    const abort = () => {
        onAbort?.();
        if (!controller.signal.aborted)
            controller.abort();
    };
    if (abortSignal.aborted)
        abort();
    else
        abortSignal.addEventListener('abort', abort);
    return () => abortSignal.removeEventListener('abort', abort);
};
export const createTimeoutGuard = (params) => {
    const { controller, timeoutMs, onTimeout } = params;
    let timer;
    const clear = () => {
        clearTimeout(timer);
    };
    const arm = () => {
        if (timeoutMs <= 0)
            return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            onTimeout?.();
            if (!controller.signal.aborted)
                controller.abort();
        }, timeoutMs);
    };
    return { arm, clear };
};
export const buildProviderResult = (params) => ({
    output: params.output,
    elapsedMs: elapsedMsSince(params.startedAt),
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
});
