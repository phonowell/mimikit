import { appendRuntimeSignalFeedback } from '../evolve/feedback.js'
import { publishThinkerDecision } from '../streams/channels.js'

import type { RuntimeState } from './runtime-state.js'
import type { TellerDigest } from '../types/index.js'

const THINKER_ERROR_REPLY = '抱歉，我刚刚处理失败了。我会马上重试并继续推进。'

export const appendThinkerErrorFeedback = (
  runtime: RuntimeState,
  error: unknown,
): Promise<void> =>
  appendRuntimeSignalFeedback({
    stateDir: runtime.config.stateDir,
    severity: 'high',
    message: `thinker error: ${
      error instanceof Error ? error.message : String(error)
    }`,
    extractedIssue: {
      kind: 'issue',
      issue: {
        title: `thinker error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        category: 'failure',
        confidence: 0.95,
        roiScore: 90,
        action: 'fix',
        rationale: 'thinker runtime failure',
        fingerprint: 'thinker_error',
      },
    },
    evidence: {
      event: 'thinker_error',
    },
    context: {
      note: 'thinker_error',
    },
  }).then(() => undefined)

export const publishThinkerErrorDecision = (
  runtime: RuntimeState,
  digest: TellerDigest,
): Promise<void> =>
  publishThinkerDecision({
    paths: runtime.paths,
    payload: {
      digestId: digest.digestId,
      decision: THINKER_ERROR_REPLY,
      inputIds: digest.inputs.map((input) => input.id),
      taskSummary: digest.taskSummary,
    },
  }).then(() => undefined)
