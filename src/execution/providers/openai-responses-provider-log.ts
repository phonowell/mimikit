import { appendLog } from './log.js'
import { OPENAI_RESPONSES_PROVIDER_ID } from './openai-responses-provider-config.js'
import { bestEffort } from './safe.js'

import type { OpenAiResponsesProviderRequest } from './types.js'

export const appendOpenAiResponsesLog = async (
  request: OpenAiResponsesProviderRequest,
  entry: Record<string, unknown>,
): Promise<void> => {
  if (!request.logPath) return
  await bestEffort('appendLog: llm_call', () =>
    appendLog(request.logPath as string, {
      ...entry,
      provider: OPENAI_RESPONSES_PROVIDER_ID,
      role: request.role,
      timeoutMs: request.timeoutMs,
      promptChars: request.prompt.length,
      promptLines: request.prompt.split(/\r?\n/).length,
      outputSchema: Boolean(request.outputSchema),
      workingDirectory: request.workDir,
      ...(request.model ? { model: request.model } : {}),
      ...(request.modelReasoningEffort
        ? { modelReasoningEffort: request.modelReasoningEffort }
        : {}),
      ...(request.logContext ?? {}),
    }),
  )
}
