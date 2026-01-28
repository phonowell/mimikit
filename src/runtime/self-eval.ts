import fs from 'node:fs/promises'

import { appendFile } from '../utils/fs.js'

import { buildSummary, trimText } from './master/helpers.js'
import { runWorker } from './worker.js'

import type { Config } from '../config.js'

type SelfEvalMode = 'heuristic' | 'codex'
type SelfEvalVerdict = 'ok' | 'issue' | 'error'

export type SelfEvalOutcome = {
  verdict: SelfEvalVerdict
  summary: string
  evaluation: string
  mode: SelfEvalMode
}

type SelfEvalInput = {
  config: Config
  taskId: string
  sessionKey: string
  prompt: string
  output: string
}

const MAX_SUMMARY_CHARS = 240

const heuristicRules = [
  {
    label: 'explicit_error',
    regex: /\b(error|exception|traceback|failed|failure)\b/i,
  },
  {
    label: 'refusal',
    regex: /\b(can(?:not|'t)|unable|not possible|won't|refuse)\b/i,
  },
  {
    label: 'uncertain',
    regex: /\b(unsure|not sure|don't know|unknown)\b/i,
  },
]

const normalizeInline = (value: string): string =>
  value
    .replace(/[\r\n"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const formatEvaluation = (
  verdict: SelfEvalVerdict,
  mode: SelfEvalMode,
  summary: string,
): string => {
  const head = `${verdict} (${mode})`
  if (!summary) return head
  return `${head}: ${summary}`
}

const runHeuristicEval = (
  output: string,
): { verdict: 'ok' | 'issue'; summary: string } => {
  for (const rule of heuristicRules) {
    if (rule.regex.test(output))
      return { verdict: 'issue', summary: rule.label }
  }

  return { verdict: 'ok', summary: '' }
}

const parseEvalOutput = (
  text: string,
): { verdict: 'ok' | 'issue'; summary: string } | null => {
  const line = text.split('\n')[0]?.trim()
  if (!line) return null
  const match = line.match(/^(ok|issue)\b[:\s-]*(.*)$/i)
  if (!match) return null
  const verdict = match[1]?.toLowerCase() === 'issue' ? 'issue' : 'ok'
  const summary = match[2]?.trim() ?? ''
  return { verdict, summary }
}

const buildEvalPrompt = (
  basePrompt: string,
  prompt: string,
  output: string,
  maxChars: number,
): string => {
  const trimmedPrompt = trimText(prompt.trim(), maxChars)
  const trimmedOutput = trimText(output.trim(), maxChars)
  return [
    basePrompt.trim(),
    '',
    'User Prompt:',
    trimmedPrompt,
    '',
    'Assistant Output:',
    trimmedOutput,
    '',
    'Return format (single line):',
    'OK <short reason> | ISSUE <short reason>',
  ].join('\n')
}

const appendLesson = async (
  config: Config,
  params: {
    taskId: string
    sessionKey: string
    prompt: string
    issue: string
  },
): Promise<void> => {
  const promptSummary = buildSummary(params.prompt, 120)
  const line = `- ${new Date().toISOString()} task ${params.taskId} (${params.sessionKey}) prompt="${normalizeInline(
    promptSummary,
  )}" issue="${normalizeInline(params.issue)}"\n`
  await appendFile(config.selfEvalMemoryPath, line)
  await trimLessonsFile(
    config.selfEvalMemoryPath,
    config.selfEvalMemoryMaxBytes,
  )
}

const trimLessonsFile = async (
  filePath: string,
  maxBytes: number,
): Promise<void> => {
  if (maxBytes <= 0) return
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(filePath, 'r')
    const stats = await handle.stat()
    if (stats.size <= maxBytes) return
    const start = Math.max(0, stats.size - maxBytes)
    const length = stats.size - start
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    await fs.writeFile(filePath, buffer.toString('utf8'), 'utf8')
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return
    throw error
  } finally {
    if (handle) await handle.close()
  }
}

export const runSelfEvaluation = async (
  input: SelfEvalInput,
): Promise<SelfEvalOutcome> => {
  if (input.config.selfEvalSkipSessionKeys.includes(input.sessionKey)) {
    return {
      verdict: 'ok',
      summary: 'skipped',
      evaluation: 'ok (skipped): session excluded',
      mode: 'heuristic',
    }
  }

  const heuristic = runHeuristicEval(input.output)
  let verdict: SelfEvalVerdict = heuristic.verdict
  let summary: string = heuristic.summary
  let mode: SelfEvalMode = 'heuristic'

  const prompt = input.config.selfEvalPrompt?.trim()
  if (prompt) {
    try {
      const evalPrompt = buildEvalPrompt(
        prompt,
        input.prompt,
        input.output,
        input.config.selfEvalMaxChars,
      )
      const evalResult = await runWorker({
        config: input.config,
        prompt: evalPrompt,
        resumePolicy: 'never',
      })
      const parsed = parseEvalOutput(evalResult.output)
      if (parsed) {
        verdict = parsed.verdict
        summary = parsed.summary
        mode = 'codex'
      } else if (!summary) summary = 'codex unparsed'
      else summary = `${summary} (codex unparsed)`
    } catch (error) {
      verdict = 'error'
      summary = error instanceof Error ? error.message : String(error)
      mode = 'codex'
    }
  }

  const trimmedSummary = trimText(summary, MAX_SUMMARY_CHARS)
  const evaluation = formatEvaluation(verdict, mode, trimmedSummary)

  if (
    verdict === 'issue' &&
    input.sessionKey !== input.config.selfImproveSessionKey
  ) {
    try {
      const issueSummary = trimmedSummary || 'issue detected'
      await appendLesson(input.config, {
        taskId: input.taskId,
        sessionKey: input.sessionKey,
        prompt: input.prompt,
        issue: issueSummary,
      })
    } catch {
      // ignore lesson write failures
    }
  }

  return {
    verdict,
    summary: trimmedSummary,
    evaluation,
    mode,
  }
}
