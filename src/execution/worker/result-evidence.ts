import { truncateText } from '../../foundation/shared/text.js'

import type {
  Task,
  TaskContract,
  TaskEvidence,
  TaskResult,
} from '../../foundation/types/index.js'

const MAX_NOTE_CHARS = 220

const clipNote = (value: string): string =>
  truncateText(value.trim(), MAX_NOTE_CHARS, {
    normalizeWhitespace: true,
  })

const summarizeOutput = (output: string): string => {
  const normalized = output.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'No output.'
  return clipNote(normalized)
}

const resolveEvidenceStatus = (
  resultStatus: TaskResult['status'],
): TaskEvidence['status'] => (resultStatus === 'succeeded' ? 'done' : 'failed')

export const buildTaskEvidence = (params: {
  task: Task
  contract?: TaskContract
  result: TaskResult
  previousStatus?: Task['status']
  archivePath?: string
}): TaskEvidence | undefined => {
  const { task, contract, result, previousStatus, archivePath } = params
  if (!contract) return undefined
  const note = summarizeOutput(result.output)
  const allMet = result.outcome === 'completed'
  const nextTaskStatus = result.taskStatus ?? task.status
  const acceptanceChecks = contract.acceptance.map((criterion) => ({
    criterion,
    met: allMet,
    ...(allMet ? {} : { note }),
  }))
  return {
    status: resolveEvidenceStatus(result.status),
    contractGoal: contract.goal,
    acceptanceChecks,
    stateDelta: {
      ...(previousStatus ? { taskStatusFrom: previousStatus } : {}),
      taskStatusTo: nextTaskStatus,
      ...(archivePath ? { archivePath } : {}),
    },
    ...(result.handoff?.nextSteps
      ? { nextSteps: result.handoff.nextSteps }
      : {}),
    ...(result.handoff?.risks ? { risks: result.handoff.risks } : {}),
  }
}

export const hasTaskEvidenceMismatch = (params: {
  task: Task
  contract?: TaskContract
  result: TaskResult
}): boolean => {
  const { task, contract, result } = params
  if (!contract) return false
  const { evidence } = result
  if (!evidence) return true
  if (evidence.contractGoal.trim() !== contract.goal.trim()) return true
  if (evidence.acceptanceChecks.length !== contract.acceptance.length)
    return true
  const expectedTo = result.taskStatus ?? task.status
  if (evidence.stateDelta.taskStatusTo !== expectedTo) return true
  return false
}
