import { DEFAULT_MODEL_REASONING_EFFORT } from './codex-settings.js';
import { appendLog } from './log.js';
import { buildProviderAbortedError, buildProviderSdkError, buildProviderTimeoutError, isTransientProviderMessage, } from './provider-error.js';
import { bestEffort } from './safe.js';
export const approvalPolicy = 'never';
export const sandboxModeFor = (role) => role === 'worker' ? 'danger-full-access' : 'read-only';
const toLogContext = (request) => ({
    role: request.role,
    timeoutMs: request.timeoutMs,
    idleTimeoutMs: request.timeoutMs,
    timeoutType: 'idle',
    promptChars: request.prompt.length,
    promptLines: request.prompt.split(/\r?\n/).length,
    outputSchema: Boolean(request.outputSchema),
    workingDirectory: request.workDir,
    sandboxMode: sandboxModeFor(request.role),
    approvalPolicy,
    ...(request.model ? { model: request.model } : {}),
    ...(request.logContext ?? {}),
});
export const appendCodexLlmLog = async (request, entry) => {
    if (!request.logPath)
        return;
    const context = toLogContext(request);
    await bestEffort('appendLog: llm_call', () => appendLog(request.logPath, { ...entry, ...context }));
};
export const buildCodexProviderError = (params) => {
    const { error, timeoutMs, timedOut, externallyAborted } = params;
    if (timedOut)
        return buildProviderTimeoutError('codex-sdk', timeoutMs);
    if (externallyAborted ||
        error.name === 'AbortError' ||
        /aborted|canceled/i.test(error.message))
        return buildProviderAbortedError('codex-sdk');
    return buildProviderSdkError({
        providerId: 'codex-sdk',
        message: error.message,
        transient: isTransientProviderMessage(error.message),
    });
};
export const createCodexThread = (codex, request) => {
    const modelReasoningEffort = request.modelReasoningEffort ?? DEFAULT_MODEL_REASONING_EFFORT;
    const threadOptions = {
        workingDirectory: request.workDir,
        ...(request.model ? { model: request.model } : {}),
        modelReasoningEffort,
        sandboxMode: sandboxModeFor(request.role),
        approvalPolicy,
    };
    const thread = request.threadId
        ? codex.resumeThread(request.threadId, threadOptions)
        : codex.startThread(threadOptions);
    return { thread, modelReasoningEffort };
};
