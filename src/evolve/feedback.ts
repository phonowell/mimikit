import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { ensureDir } from '../fs/paths.js'
import { appendJsonl, readJsonl } from '../storage/jsonl.js'

import type { ReplaySuite } from '../eval/replay-types.js'

export type EvolveFeedback = {
  id: string
  createdAt: string
  kind: 'user_feedback' | 'runtime_signal'
  severity: 'low' | 'medium' | 'high'
  message: string
  context?: {
    input?: string
    response?: string
    note?: string
  }
}

const feedbackPath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback.jsonl'))

const suitePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback-suite.json'))

const feedbackStatePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback-state.json'))

export type EvolveFeedbackState = {
  processedCount: number
  lastRunAt?: string
}

export const selectPendingFeedback = (params: {
  feedback: EvolveFeedback[]
  processedCount: number
  historyLimit: number
}): EvolveFeedback[] => {
  const start = Math.min(
    Math.max(0, params.processedCount),
    params.feedback.length,
  )
  const pending = params.feedback.slice(start)
  if (pending.length === 0) return []
  const limit = Math.max(0, params.historyLimit)
  if (limit === 0 || pending.length <= limit) return pending
  return pending.slice(Math.max(0, pending.length - limit))
}

export const appendEvolveFeedback = async (
  stateDir: string,
  feedback: EvolveFeedback,
): Promise<void> => {
  const path = feedbackPath(stateDir)
  await ensureDir(dirname(path))
  await appendJsonl(path, [feedback])
}

export const readEvolveFeedback = (
  stateDir: string,
): Promise<EvolveFeedback[]> =>
  readJsonl<EvolveFeedback>(feedbackPath(stateDir))

export const readEvolveFeedbackState = (
  stateDir: string,
): Promise<EvolveFeedbackState> =>
  readJson<EvolveFeedbackState>(feedbackStatePath(stateDir), {
    processedCount: 0,
  })

export const writeEvolveFeedbackState = async (
  stateDir: string,
  state: EvolveFeedbackState,
): Promise<void> => {
  const path = feedbackStatePath(stateDir)
  await ensureDir(dirname(path))
  await writeJson(path, state)
}

export const resetEvolveFeedbackState = async (
  stateDir: string,
): Promise<void> => {
  await writeEvolveFeedbackState(stateDir, { processedCount: 0 })
}

export const hasPendingEvolveFeedback = async (params: {
  stateDir: string
  historyLimit: number
}): Promise<boolean> => {
  const feedback = await readEvolveFeedback(params.stateDir)
  const state = await readEvolveFeedbackState(params.stateDir)
  const pending = selectPendingFeedback({
    feedback,
    processedCount: state.processedCount,
    historyLimit: params.historyLimit,
  })
  return pending.length > 0
}

const toReplayCase = (
  feedback: EvolveFeedback,
  index: number,
): ReplaySuite['cases'][number] => {
  const input = feedback.context?.input ?? feedback.message
  const mustContain = feedback.context?.note
    ? [feedback.context.note]
    : undefined
  return {
    id: `feedback-${index + 1}`,
    description: feedback.message,
    history: [],
    inputs: [
      {
        id: `feedback-input-${index + 1}`,
        text: input,
        createdAt: feedback.createdAt,
      },
    ],
    tasks: [],
    results: [],
    ...(mustContain
      ? {
          expect: {
            output: { mustContain },
          },
        }
      : {}),
  }
}

export const writeFeedbackReplaySuite = async (params: {
  stateDir: string
  feedback: EvolveFeedback[]
  maxCases: number
}): Promise<ReplaySuite | null> => {
  const items = params.feedback
    .slice(Math.max(0, params.feedback.length - params.maxCases))
    .map((item, index) => toReplayCase(item, index))
  if (items.length === 0) return null
  const suite: ReplaySuite = {
    suite: 'feedback-derived-suite',
    version: 1,
    cases: items,
  }
  const path = suitePath(params.stateDir)
  await ensureDir(dirname(path))
  await writeFile(path, `${JSON.stringify(suite, null, 2)}\n`, 'utf8')
  return suite
}

export const getFeedbackReplaySuitePath = (stateDir: string): string =>
  suitePath(stateDir)
