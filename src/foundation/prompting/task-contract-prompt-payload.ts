import { compactTaskContractForPrompt } from '../shared/task-contract-compact.js'

import type { TaskContract } from '../types/index.js'

export const buildTaskContractPromptPayload = (
  contract?: TaskContract,
): Record<string, unknown> | undefined => {
  const compactContract = compactTaskContractForPrompt(contract)
  if (!compactContract) return undefined
  return {
    goal: compactContract.goal,
    scope: compactContract.scope,
    acceptance: compactContract.acceptance,
    ...(compactContract.outOfScope
      ? { out_of_scope: compactContract.outOfScope }
      : {}),
    ...(compactContract.contextRefs
      ? { context_refs: compactContract.contextRefs }
      : {}),
  }
}
