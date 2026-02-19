import { nowIso } from '../shared/utils.js'

import {
  byLastReferencedDesc,
  byUpdatedDesc,
  collectBatchEvidenceIds,
  FOCUS_SYNC_INTERVAL,
  resolveFocusSlots,
  tokenize,
} from './common.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ConversationFocus,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type FocusManagerContext = {
  active: ConversationFocus[]
  memory: ConversationFocus[]
  control: {
    turn: number
    maxSlots: number
    updateRequired: boolean
    reason: 'periodic' | 'result_event' | 'bootstrap' | 'idle'
  }
  evidenceIds: Set<string>
}

const scoreMemory = (
  expired: ConversationFocus[],
  queryTokens: Set<string>,
): ConversationFocus[] =>
  expired
    .map((focus) => {
      const tokens = tokenize(`${focus.title}\n${focus.summary}`)
      if (tokens.size === 0) return null
      let shared = 0
      for (const token of queryTokens) if (tokens.has(token)) shared += 1
      if (shared === 0) return null
      return { focus, score: shared / Math.max(1, tokens.size) }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      return byLastReferencedDesc(left.focus, right.focus)
    })
    .map((item) => item.focus)

export const buildFocusManagerContext = (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
}): FocusManagerContext => {
  const { runtime, inputs, results } = params
  const maxSlots = resolveFocusSlots(runtime)
  const active = runtime.focuses.filter((focus) => focus.status === 'active')
  const expired = runtime.focuses.filter((focus) => focus.status === 'expired')
  const evidenceIds = collectBatchEvidenceIds(inputs, results)
  const queryTokens = tokenize(
    [...inputs.map((item) => item.text), ...results.map((item) => item.output)]
      .join('\n')
      .trim(),
  )
  const memory =
    queryTokens.size === 0
      ? []
      : scoreMemory(expired, queryTokens).slice(0, maxSlots)

  if (memory.length > 0) {
    const touchedAt = nowIso()
    const touched = new Set(memory.map((item) => item.id))
    runtime.focuses = runtime.focuses.map((focus) =>
      touched.has(focus.id) ? { ...focus, lastReferencedAt: touchedAt } : focus,
    )
  }

  const periodic =
    runtime.managerTurn > 0 && runtime.managerTurn % FOCUS_SYNC_INTERVAL === 0
  const resultEvent = results.length > 0
  const bootstrap = active.length === 0 && inputs.length > 0
  const reason = periodic
    ? 'periodic'
    : resultEvent
      ? 'result_event'
      : bootstrap
        ? 'bootstrap'
        : 'idle'

  return {
    active: [...active].sort(byUpdatedDesc).slice(0, maxSlots),
    memory,
    control: {
      turn: runtime.managerTurn,
      maxSlots,
      updateRequired: periodic || resultEvent || bootstrap,
      reason,
    },
    evidenceIds,
  }
}
