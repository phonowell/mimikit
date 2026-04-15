import {
  clampNormalizedTextList,
  normalizeTextLine,
  splitNormalizedClauses,
} from './normalized-text.js'

type TaskDraftLike = {
  title: string
  goal: string
  in_scope: string[]
  out_of_scope: string[]
  done_when: string[]
  context_refs: string[]
  instructions: string[]
}

const MAX_TASK_TITLE_CHARS = 120
const MAX_TASK_TITLE_BYTES = 360
const MAX_TASK_GOAL_CHARS = 240
const MAX_TASK_GOAL_BYTES = 720
const MAX_TASK_LIST_ITEM_CHARS = 160
const MAX_TASK_LIST_ITEM_BYTES = 480
const MAX_TASK_CONTEXT_REF_CHARS = 200
const MAX_TASK_CONTEXT_REF_BYTES = 600
const MAX_TASK_INSTRUCTION_CHARS = 120
const MAX_TASK_INSTRUCTION_BYTES = 360
const TASK_DRAFT_MAX_TOTAL_CHARS = 900
const TASK_DRAFT_MAX_TOTAL_BYTES = 2_700

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const splitClauses = (value: string): string[] => splitNormalizedClauses(value)

const clampList = (values: readonly string[], max: number): string[] =>
  clampNormalizedTextList(values, max)

const withinStringBudget = (
  value: string,
  maxChars: number,
  maxBytes: number,
): boolean => value.length <= maxChars && byteLength(value) <= maxBytes

const compactClauseHeavyString = (
  value: string,
  maxChars: number,
  maxBytes: number,
): string => {
  const normalized = normalizeTextLine(value)
  if (withinStringBudget(normalized, maxChars, maxBytes)) return normalized
  const clauses = splitClauses(normalized)
  if (clauses.length <= 1) return normalized
  while (clauses.length > 1) {
    const compacted = clauses.join('；')
    if (withinStringBudget(compacted, maxChars, maxBytes)) return compacted
    clauses.pop()
  }
  return clauses[0] ?? normalized
}

const compactClauseHeavyList = (params: {
  values: readonly string[]
  maxItems: number
  maxChars: number
  maxBytes: number
}): string[] =>
  clampList(
    params.values.map((item) =>
      compactClauseHeavyString(item, params.maxChars, params.maxBytes),
    ),
    params.maxItems,
  )

const draftTotals = (
  draft: TaskDraftLike,
): { chars: number; bytes: number } => {
  const parts = [
    draft.title,
    draft.goal,
    ...draft.in_scope,
    ...draft.out_of_scope,
    ...draft.done_when,
    ...draft.context_refs,
    ...draft.instructions,
  ]
  return {
    chars: parts.reduce((sum, item) => sum + item.length, 0),
    bytes: parts.reduce((sum, item) => sum + byteLength(item), 0),
  }
}

const withinDraftBudget = (draft: TaskDraftLike): boolean => {
  const totals = draftTotals(draft)
  return (
    totals.chars <= TASK_DRAFT_MAX_TOTAL_CHARS &&
    totals.bytes <= TASK_DRAFT_MAX_TOTAL_BYTES
  )
}

export const canonicalizeTaskDraft = <TDraft extends TaskDraftLike>(
  draft: TDraft,
): TDraft => {
  const compacted = {
    ...draft,
    title: compactClauseHeavyString(
      draft.title,
      MAX_TASK_TITLE_CHARS,
      MAX_TASK_TITLE_BYTES,
    ),
    goal: compactClauseHeavyString(
      draft.goal,
      MAX_TASK_GOAL_CHARS,
      MAX_TASK_GOAL_BYTES,
    ),
    in_scope: compactClauseHeavyList({
      values: draft.in_scope,
      maxItems: 3,
      maxChars: MAX_TASK_LIST_ITEM_CHARS,
      maxBytes: MAX_TASK_LIST_ITEM_BYTES,
    }),
    out_of_scope: compactClauseHeavyList({
      values: draft.out_of_scope,
      maxItems: 2,
      maxChars: MAX_TASK_LIST_ITEM_CHARS,
      maxBytes: MAX_TASK_LIST_ITEM_BYTES,
    }),
    done_when: compactClauseHeavyList({
      values: draft.done_when,
      maxItems: 3,
      maxChars: MAX_TASK_LIST_ITEM_CHARS,
      maxBytes: MAX_TASK_LIST_ITEM_BYTES,
    }),
    context_refs: compactClauseHeavyList({
      values: draft.context_refs,
      maxItems: 3,
      maxChars: MAX_TASK_CONTEXT_REF_CHARS,
      maxBytes: MAX_TASK_CONTEXT_REF_BYTES,
    }),
    instructions: compactClauseHeavyList({
      values: draft.instructions,
      maxItems: 2,
      maxChars: MAX_TASK_INSTRUCTION_CHARS,
      maxBytes: MAX_TASK_INSTRUCTION_BYTES,
    }),
  }

  while (!withinDraftBudget(compacted)) {
    if (compacted.instructions.length > 0) {
      compacted.instructions = compacted.instructions.slice(0, -1)
      continue
    }
    if (compacted.context_refs.length > 0) {
      compacted.context_refs = compacted.context_refs.slice(0, -1)
      continue
    }
    if (compacted.out_of_scope.length > 1) {
      compacted.out_of_scope = compacted.out_of_scope.slice(0, -1)
      continue
    }
    if (compacted.done_when.length > 1) {
      compacted.done_when = compacted.done_when.slice(0, -1)
      continue
    }
    if (compacted.in_scope.length > 1) {
      compacted.in_scope = compacted.in_scope.slice(0, -1)
      continue
    }
    if (compacted.out_of_scope.length > 0) {
      compacted.out_of_scope = []
      continue
    }
    break
  }

  return compacted
}
