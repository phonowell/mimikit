import { appendReportingEvent } from '../../../reporting/events.js'
import { publishThinkerDecision } from '../../../streams/channels.js'

import type { TellerDigest } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

const THINKER_ERROR_REPLY = '抱歉，我刚刚处理失败了。我会马上重试并继续推进。'

export const appendThinkerErrorFeedback = (
  runtime: RuntimeState,
  error: unknown,
): Promise<void> =>
  appendReportingEvent({
    stateDir: runtime.config.stateDir,
    source: 'thinker_error',
    category: 'failure',
    severity: 'high',
    message: `thinker error: ${
      error instanceof Error ? error.message : String(error)
    }`,
    note: 'thinker_error',
  }).then(() => undefined)

export const publishThinkerErrorDecision = (
  runtime: RuntimeState,
  digest: TellerDigest,
): Promise<void> =>
  publishThinkerDecision({
    paths: runtime.paths,
    payload: {
      digestId: digest.digestId || `thinker-error-${Date.now()}`,
      decision: THINKER_ERROR_REPLY,
      inputIds: digest.inputs.map((input) => input.id),
      taskSummary: digest.taskSummary,
    },
  }).then(() => undefined)
