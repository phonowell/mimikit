import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'
import { readHistory } from '../storage/jsonl.js'
import { runThinker } from '../thinker/runner.js'

import { parseCommands } from './command-parser.js'
import { selectRecentHistory } from './history-select.js'

import type { RuntimeState } from './runtime-state.js'
import type { ExtractIssueResult } from '../evolve/feedback.js'

type IdleReviewItem = {
  message: string
}

const parseIdleReviewItems = (output: string): IdleReviewItem[] => {
  const parsed = parseCommands(output)
  const items: IdleReviewItem[] = []
  for (const command of parsed.commands) {
    if (command.action !== 'capture_feedback') continue
    const message = command.attrs.message?.trim() ?? ''
    if (!message) continue
    items.push({ message })
  }
  return items
}

const buildIdleReviewPrompt = (historyTexts: string[]): string => {
  const historyBlock = historyTexts
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n')
  return [
    'Review recent user-assistant conversation snippets and extract only high-value issues.',
    'Return commands only, each in one line:',
    '@capture_feedback message="..."',
    'Rules:',
    '- Ignore emotional-only statements with no actionable value.',
    '- Prefer issues with repeated evidence, high cost, high latency, or failures.',
    '- If no valuable issue exists, return empty output.',
    'Conversation snippets:',
    historyBlock,
  ].join('\n')
}

export const runIdleConversationReview = async (params: {
  runtime: RuntimeState
  appendFeedback: (args: {
    message: string
    extractedIssue: ExtractIssueResult
  }) => Promise<void>
}): Promise<{ captured: number; usageTotal: number; elapsedMs: number }> => {
  const history = await readHistory(params.runtime.paths.history)
  const recent = selectRecentHistory(history, {
    minCount: params.runtime.config.evolve.idleReviewHistoryCount,
    maxCount: params.runtime.config.evolve.idleReviewHistoryCount,
    maxBytes: params.runtime.config.thinker.historyMaxBytes,
  })
  if (recent.length === 0) return { captured: 0, usageTotal: 0, elapsedMs: 0 }

  const prompt = buildIdleReviewPrompt(
    recent.map((item) => `${item.role}: ${item.text}`),
  )

  const reviewResult = await runThinker({
    stateDir: params.runtime.config.stateDir,
    workDir: params.runtime.config.workDir,
    inputs: [
      {
        id: `idle-review-${Date.now()}`,
        text: prompt,
        createdAt: nowIso(),
      },
    ],
    results: [],
    tasks: [],
    history: recent,
    timeoutMs: Math.min(
      45_000,
      params.runtime.config.worker.standard.timeoutMs,
    ),
    model: params.runtime.config.thinker.model,
    modelReasoningEffort: params.runtime.config.thinker.modelReasoningEffort,
  })

  const items = parseIdleReviewItems(reviewResult.output)
  for (const item of items) {
    await params.appendFeedback({
      message: item.message,
      extractedIssue: {
        kind: 'issue',
        issue: {
          title: item.message,
          category: 'other',
        },
      },
    })
  }

  await bestEffort('appendLog: idle_review', () =>
    appendLog(params.runtime.paths.log, {
      event: 'idle_review',
      historyCount: recent.length,
      captured: items.length,
      elapsedMs: reviewResult.elapsedMs,
      ...(reviewResult.usage ? { usage: reviewResult.usage } : {}),
    }),
  )

  return {
    captured: items.length,
    usageTotal: reviewResult.usage?.total ?? 0,
    elapsedMs: reviewResult.elapsedMs,
  }
}
