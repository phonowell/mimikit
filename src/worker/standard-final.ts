import { appendTaskProgress } from '../storage/task-progress.js'

import {
  buildFinalOutputRepairHint,
  validateWorkerFinalOutput,
} from './final-output.js'

type Finalized = {
  kind: 'finalized'
  output: string
  blockerCount: number
}

type Retry = {
  kind: 'retry'
  repairAttempts: number
  hint: string
}

type Failed = {
  kind: 'failed'
  error: string
}

type FinalDecision = Finalized | Retry | Failed

export const handleStandardFinalOutput = async (params: {
  stateDir: string
  taskId: string
  round: number
  rawOutput: string
  evidenceRefs: ReadonlySet<string>
  repairAttempts: number
  maxRepairAttempts: number
}): Promise<FinalDecision> => {
  const validation = validateWorkerFinalOutput({
    raw: params.rawOutput,
    profile: 'standard',
    evidenceRefs: params.evidenceRefs,
  })
  if (validation.ok) {
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.taskId,
      type: 'standard_final_validated',
      payload: {
        round: params.round,
        repairAttempts: params.repairAttempts,
        blockerCount: validation.data.execution_insights.blockers.length,
      },
    })
    return {
      kind: 'finalized',
      output: validation.serialized,
      blockerCount: validation.data.execution_insights.blockers.length,
    }
  }

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'standard_final_rejected',
    payload: {
      round: params.round,
      repairAttempts: params.repairAttempts,
      errors: validation.errors,
    },
  })
  if (params.repairAttempts >= params.maxRepairAttempts) {
    return {
      kind: 'failed',
      error: `standard_final_output_invalid:${validation.errors.join('|')}`,
    }
  }

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: 'standard_self_repair',
    payload: {
      round: params.round,
      repairAttempts: params.repairAttempts + 1,
    },
  })
  return {
    kind: 'retry',
    repairAttempts: params.repairAttempts + 1,
    hint: buildFinalOutputRepairHint(validation.errors),
  }
}
