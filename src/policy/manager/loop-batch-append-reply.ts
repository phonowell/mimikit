import { nowIso } from '../../foundation/shared/utils.js'
import { broadcastAgentReply } from '../../kernel/orchestrator/channel-broadcast.js'
import { appendHistory } from '../../persistence/history/store.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { extractArtifactLinksFromText } from '../../surface/shared/artifact-link.js'
import { resolveDefaultFocusId, touchFocus } from '../../work/focus/state.js'

import type { TokenUsage } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const appendManagerReply = async (params: {
  runtime: ManagerRuntime
  text: string
  nextInputsCursor: number
  usage?: TokenUsage
  elapsedMs?: number
  sourceInputIds?: string[]
  sourceTaskIds?: string[]
  sourcePlanIds?: string[]
  artifacts?: ReturnType<typeof extractArtifactLinksFromText>
}): Promise<void> => {
  const replyFocusId = resolveDefaultFocusId(params.runtime)
  touchFocus(params.runtime, replyFocusId)
  const messageId = `agent-${Date.now()}-${params.nextInputsCursor}`
  const artifacts =
    params.artifacts ?? extractArtifactLinksFromText(params.text)
  await appendHistory(params.runtime.paths.history, {
    id: messageId,
    role: 'agent',
    text: params.text,
    createdAt: nowIso(),
    focusId: replyFocusId,
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.elapsedMs !== undefined && params.elapsedMs >= 0
      ? { elapsedMs: params.elapsedMs }
      : {}),
    ...(params.sourceInputIds ? { sourceInputIds: params.sourceInputIds } : {}),
    ...(params.sourceTaskIds ? { sourceTaskIds: params.sourceTaskIds } : {}),
    ...(params.sourcePlanIds ? { sourcePlanIds: params.sourcePlanIds } : {}),
    ...(artifacts ? { artifacts } : {}),
  })
  await bestEffort('broadcast:agent_reply', () =>
    broadcastAgentReply({
      runtime: params.runtime,
      messageId,
      text: params.text,
    }),
  )
}
