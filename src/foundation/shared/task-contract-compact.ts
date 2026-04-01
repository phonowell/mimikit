import type { TaskContract } from '../types/index.js'

type TaskDraftLike = {
  title: string
  goal: string
  in_scope: string[]
  out_of_scope: string[]
  done_when: string[]
  context_refs: string[]
  instructions: string[]
}

type ContractCompactLimits = {
  scopeClauses: number
  acceptanceItems: number
  outOfScopeClauses: number
  contextRefs: number
}

const TASK_DRAFT_MAX_TOTAL_CHARS = 900
const TASK_DRAFT_MAX_TOTAL_BYTES = 2_700
const clausePattern = /\s*(?:\r?\n|；|;)\s*/u

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const normalizeLine = (value: string): string => value.trim()

const normalizeList = (values: readonly string[]): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of values) {
    const trimmed = normalizeLine(item)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

const splitClauses = (value: string | undefined): string[] =>
  !value ? [] : normalizeList(value.split(clausePattern))

const joinClauses = (
  value: string | undefined,
  maxClauses: number,
): string | undefined => {
  const clauses = splitClauses(value).slice(0, maxClauses)
  return clauses.length > 0 ? clauses.join('；') : undefined
}

const clampList = (values: readonly string[], max: number): string[] =>
  normalizeList(values).slice(0, max)

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

const compactTaskContract = (
  contract: TaskContract,
  limits: ContractCompactLimits,
): TaskContract => {
  const compacted: TaskContract = {
    goal: normalizeLine(contract.goal),
    scope:
      joinClauses(contract.scope, limits.scopeClauses) ??
      normalizeLine(contract.scope),
    acceptance: clampList(contract.acceptance, limits.acceptanceItems),
  }
  const outOfScope = joinClauses(contract.outOfScope, limits.outOfScopeClauses)
  if (outOfScope) compacted.outOfScope = outOfScope
  const contextRefs = clampList(contract.contextRefs ?? [], limits.contextRefs)
  if (contextRefs.length > 0) compacted.contextRefs = contextRefs
  return compacted
}

export const compactTaskContractForPrompt = (
  contract?: TaskContract,
): TaskContract | undefined =>
  contract
    ? compactTaskContract(contract, {
        scopeClauses: 2,
        acceptanceItems: 2,
        outOfScopeClauses: 2,
        contextRefs: 2,
      })
    : undefined

export const compactTaskContractForMatching = (
  contract?: TaskContract,
): TaskContract | undefined =>
  contract
    ? compactTaskContract(contract, {
        scopeClauses: 3,
        acceptanceItems: 3,
        outOfScopeClauses: 2,
        contextRefs: 0,
      })
    : undefined

export const canonicalizeTaskDraft = <TDraft extends TaskDraftLike>(
  draft: TDraft,
): TDraft => {
  const compacted = {
    ...draft,
    title: normalizeLine(draft.title),
    goal: normalizeLine(draft.goal),
    in_scope: clampList(draft.in_scope, 3),
    out_of_scope: clampList(draft.out_of_scope, 2),
    done_when: clampList(draft.done_when, 3),
    context_refs: clampList(draft.context_refs, 3),
    instructions: clampList(draft.instructions, 2),
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
