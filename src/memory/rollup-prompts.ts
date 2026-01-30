import { execCodex } from '../codex.js'

export const summarize = async (params: {
  prompt: string
  workDir: string
  model?: string | undefined
}): Promise<string> => {
  const result = await execCodex({
    prompt: params.prompt,
    workDir: params.workDir,
    model: params.model,
    timeout: 10 * 60 * 1000,
  })
  return result.output.trim()
}

export const buildDailyPrompt = (day: string, content: string): string =>
  [
    'You are summarizing conversation logs.',
    `Date: ${day}`,
    'Write a concise markdown summary with bullet points.',
    'Focus on decisions, tasks, open issues, and key facts.',
    'No preface, no code fences, no headings.',
    '',
    content,
  ].join('\n')

export const buildMonthlyPrompt = (month: string, content: string): string =>
  [
    'You are summarizing daily summaries into a monthly summary.',
    `Month: ${month}`,
    'Write a concise markdown summary with bullet points.',
    'Focus on decisions, tasks, open issues, and key facts.',
    'No preface, no code fences, no headings.',
    '',
    content,
  ].join('\n')
