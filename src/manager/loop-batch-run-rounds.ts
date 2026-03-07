import { parseActions } from '../actions/protocol/parse.js'
import {
  hasNoChoiceReturnChannelInput,
  isNoChoiceReturnChannelSource,
} from '../channels/feishu/source.js'
import { appendLog } from '../log/append.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import {
  buildBatchSuccessResult,
  buildRoundLimitResult,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
export const runManagerCorrectionRounds = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: FocusId[]
  maxCorrectionRounds: number
  resolveFocusId: () => FocusId
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
}> => {
  const {
    runtime,
    inputs,
    results,
    tasks,
    plans,
    workingFocusIds,
    maxCorrectionRounds,
    resolveFocusId,
  } = params
  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let previousLookupKey: string | undefined
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasNoChoiceReturnChannelInput(inputs) &&
    !isNoChoiceReturnChannelSource(runtime.lastUserMeta?.source)
  for (let round = 1; round <= maxCorrectionRounds; round++) {
    const runResult = await runManagerRoundWithRecovery({
      runtime,
      round,
      inputs,
      results,
      tasks,
      plans,
      workingFocusIds,
      extra,
    })
    elapsedMs += runResult.elapsedMs
    batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)
    const parsed = parseActions(runResult.output)
    lastParsed = parsed
    const followup = await resolveRoundFollowup({
      runtime,
      parsed: parsed.actions,
      output: runResult.output,
      allowAskUserChoice,
      resultTaskIds,
      resolveFocusId,
      ...(previousLookupKey ? { previousLookupKey } : {}),
    })
    if (followup.done) {
      return buildBatchSuccessResult({
        parsed,
        elapsedMs,
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
    }
    previousLookupKey = followup.lookupKey
    extra = followup.extra
  }
  await appendLog(runtime.paths.log, {
    event: 'manager_correction_round_limit_reached',
    maxCorrectionRounds,
  })
  return buildRoundLimitResult({
    text: lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
