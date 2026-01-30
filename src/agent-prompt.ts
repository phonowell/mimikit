import { filterChatHistory, sortTaskResults } from './agent-history.js'
import { cleanUserInput, shouldIncludeStateDir } from './agent-input.js'
import { formatCheckHistory } from './agent-self-awake-checks.js'
import {
  RUNTIME_AGENT_PROMPT,
  SELF_AWAKE_PROMPT,
  STATE_DIR_INSTRUCTION,
} from './prompt.js'

import type { AgentContext } from './agent-types.js'
import type { BacklogItem } from './backlog.js'

export type SelfAwakePromptContext = {
  backlog: BacklogItem[]
  checkHistory?: Record<string, string>
}

const RUNTIME_AGENT_DECLARATION = 'You are the Mimikit runtime agent.'

const formatBacklog = (backlog: BacklogItem[]): string => {
  const pending = backlog.filter((item) => !item.done)
  if (pending.length === 0) return 'No pending items.'
  return pending.map((item) => `- ${item.text}`).join('\n')
}

const appendSelfAwakeContext = (
  parts: string[],
  context: SelfAwakePromptContext | null | undefined,
): void => {
  if (!context) return
  parts.push('## Self-Awake Check History')
  parts.push(formatCheckHistory(context.checkHistory))
  parts.push('')
  parts.push('## Backlog')
  parts.push(formatBacklog(context.backlog))
  parts.push('')
}

export const buildPrompt = (
  stateDir: string,
  context: AgentContext,
  selfAwakeContext?: SelfAwakePromptContext | null,
): string => {
  const parts: string[] = [RUNTIME_AGENT_DECLARATION, '', RUNTIME_AGENT_PROMPT]
  const hasUserInputs = context.userInputs.length > 0

  if (context.isSelfAwake) {
    parts.push('')
    parts.push(SELF_AWAKE_PROMPT)
    parts.push('')
    appendSelfAwakeContext(parts, selfAwakeContext)
  }

  if (hasUserInputs && shouldIncludeStateDir(context.userInputs)) {
    parts.push(STATE_DIR_INSTRUCTION(stateDir))
    parts.push('')
  }

  if (hasUserInputs && context.chatHistory.length > 0) {
    const history = filterChatHistory(context.chatHistory, context.userInputs)
    if (history.length > 0) {
      parts.push('## Recent Conversation')
      for (const msg of history) {
        const prefix = msg.role === 'user' ? 'U:' : 'A:'
        parts.push(`${prefix} ${msg.text}`)
      }

      parts.push('')
    }
  }

  if (hasUserInputs && context.memoryHits) {
    parts.push(context.memoryHits)
    parts.push('')
  }

  if (hasUserInputs) {
    parts.push('## New User Inputs')
    for (const input of context.userInputs)
      parts.push(`[${input.createdAt}] ${cleanUserInput(input.text)}`)

    parts.push('')
  }

  if (context.taskResults.length > 0) {
    parts.push('## Completed Tasks')
    const recent = sortTaskResults(context.taskResults)
    for (const result of recent) {
      parts.push(`T${result.id}: ${result.status}`)
      if (result.result) parts.push(result.result)
      if (result.error) parts.push(`Error: ${result.error}`)
      parts.push('')
    }
  }

  return parts.join('\n')
}
