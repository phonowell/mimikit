import { basename } from 'node:path'

import {
  askUserChoiceSchema,
  mutateTaskSchema,
  parseAskUserChoiceAttrs,
  rememberMemorySchema,
  runTaskSchema,
} from './action-apply-schema.js'
import {
  buildMissingIntentEvidenceHint,
  isMutateTaskGitOp,
  isSupportedByInputs,
  validateMutateTaskGitIntentEvidence,
} from './action-intent-evidence-match.js'
import { hasResumeChoiceEffectTask } from './action-intent-evidence-resume-choice.js'
import { parseActionAttrs } from './action-parse.js'
import { resolveRunTaskConfirmationRequirement } from './run-task-confirmation.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'
export { validateRestartRuntimeIntentEvidence } from './action-intent-evidence-restart-runtime.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Task, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveMutateTaskRef = (
  task: Task | undefined,
  taskId: string,
): string => {
  const title = task?.title.trim()
  if (title) return `${taskId} / ${title}`
  return taskId
}

export const validateEnqueueTaskIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  confirmedRunTaskChoiceIds?: Set<string>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const {
    item,
    inputTexts,
    confirmedRunTaskChoiceIds,
    supplementalEvidenceSources,
  } = params
  const parsed = parseActionAttrs(item, runTaskSchema)
  if (!parsed) return undefined
  const contract = buildTaskContractFromAttrs(parsed)
  const workerPrompt = resolveWorkerPromptFromAttrs(parsed)
  if (!contract || !workerPrompt) return undefined
  const confirmation = resolveRunTaskConfirmationRequirement({
    prompt: workerPrompt,
    title: parsed.title,
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
  })
  if (confirmedRunTaskChoiceIds?.has(confirmation.choiceId)) return undefined

  const candidates = [parsed.title, contract.goal, contract.scope]
  const combinedCandidate = [
    parsed.title,
    contract.goal,
    contract.scope,
    ...contract.acceptance,
    ...(contract.outOfScope ? [contract.outOfScope] : []),
  ].join('\n')
  if (
    isSupportedByInputs({ candidates, combinedCandidate, inputs: inputTexts })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}

export const validateMutateTaskIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  inputs?: UserInput[]
  taskById?: Map<string, Task>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, inputs, taskById, supplementalEvidenceSources } =
    params
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return undefined
  const resumeInstruction = parsed.resume_instruction?.trim()
  const task = taskById?.get(parsed.id)
  if (isMutateTaskGitOp(parsed.op)) {
    return validateMutateTaskGitIntentEvidence({
      op: parsed.op,
      reason: parsed.reason,
      task,
      taskId: parsed.id,
      inputTexts,
      ...(supplementalEvidenceSources ? { supplementalEvidenceSources } : {}),
    })
  }
  const candidates = [parsed.id]
  if (task?.title.trim()) candidates.push(task.title)
  if (task?.branch?.trim()) candidates.push(task.branch)
  const cwdBase = task?.cwd.trim() ? basename(task.cwd.trim()) : ''
  if (cwdBase) candidates.push(cwdBase)
  if (parsed.op === 'resume' && resumeInstruction) {
    if (
      !isSupportedByInputs({
        candidates: [resumeInstruction],
        combinedCandidate: resumeInstruction,
        inputs: inputTexts,
      })
    ) {
      return buildMissingIntentEvidenceHint({
        actionName: item.name,
        evidenceSources: supplementalEvidenceSources,
        taskRef: resolveMutateTaskRef(task, parsed.id),
      })
    }
    if (hasResumeChoiceEffectTask(inputs, parsed.id, parsed.op))
      return undefined
  } else if (hasResumeChoiceEffectTask(inputs, parsed.id, parsed.op))
    return undefined

  if (isSupportedByInputs({ candidates, inputs: inputTexts })) return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
    taskRef: resolveMutateTaskRef(task, parsed.id),
  })
}

export const validateAskUserChoiceIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  if (!askUserChoiceSchema.safeParse(item.attrs).success) return undefined
  const parsed = parseAskUserChoiceAttrs(item.attrs)
  if (!parsed) return undefined

  const candidates = [
    parsed.question,
    ...parsed.options.map((option) => option.label),
    ...parsed.options.map((option) => option.reason),
  ]
  const combinedCandidate = [parsed.question, ...candidates].join('\n')
  if (
    isSupportedByInputs({ candidates, combinedCandidate, inputs: inputTexts })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}
export const validateRememberMemoryIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return undefined
  if (
    isSupportedByInputs({
      candidates: [parsed.content],
      combinedCandidate: parsed.content,
      inputs: inputTexts,
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}
