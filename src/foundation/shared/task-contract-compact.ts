import type { TaskContract } from '../types/index.js'

type ContractCompactLimits = {
  scopeClauses: number
  acceptanceItems: number
  outOfScopeClauses: number
  contextRefs: number
}

const clausePattern = /\s*(?:\r?\n|；|;)\s*/u

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
