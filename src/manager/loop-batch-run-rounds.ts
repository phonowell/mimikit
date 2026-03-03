import { parseActions } from '../actions/protocol/parse.js'
import { hasQqUserInput } from '../channels/qq/index.js'
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
  stream: {
    appendDelta: (delta: string) => void
    setUsage: (usage: TokenUsage) => void
    commitParsedText: (text: string) => void
    resetCycle: () => void
  }
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
    stream,
    resolveFocusId,
  } = params
  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let previousLookupKey: string | undefined
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const hasQueryData = inputs.length > 0 || results.length > 0
  const allowAskUserChoice =
    !hasQqUserInput(inputs) && runtime.lastUserMeta?.source !== 'qq'
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
      onTextDelta: stream.appendDelta,
      onUsage: stream.setUsage,
    })
    if (runResult.usage) stream.setUsage(runResult.usage)
    elapsedMs += runResult.elapsedMs
    batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)
    const parsed = parseActions(runResult.output)
    lastParsed = parsed
    stream.commitParsedText(parsed.text)
    const followup = await resolveRoundFollowup({
      runtime,
      parsed: parsed.actions,
      output: runResult.output,
      hasQueryData,
      allowAskUserChoice,
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
    stream.resetCycle()
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
