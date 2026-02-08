import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { runThinker } from '../thinker/runner.js'

type OptimizeResult = {
  original: string
  candidate: string
}

const OPTIMIZER_SYSTEM = [
  '你是 Prompt 优化器。',
  '任务：在不改变行为边界的前提下，优化提示词以提升通过率并降低 tokens/time。',
  '硬约束：',
  '1) 保留原意与安全边界；',
  '2) 删除冗余、压缩重复；',
  '3) 不引入与当前系统无关的新规则；',
  '4) 仅输出优化后的完整提示词文本，不要解释。',
].join('\n')

const buildOptimizerPrompt = (source: string): string =>
  [
    OPTIMIZER_SYSTEM,
    '',
    '以下是当前提示词，请输出优化后的完整版本：',
    '---BEGIN PROMPT---',
    source,
    '---END PROMPT---',
  ].join('\n')

const normalizeOutput = (output: string): string => {
  const trimmed = output.trim()
  if (!trimmed) return ''
  return `${trimmed}\n`
}

export const optimizeManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  promptPath: string
  model?: string
  timeoutMs: number
}): Promise<OptimizeResult> => {
  const resolvedPath = resolve(params.promptPath)
  const original = await readFile(resolvedPath, 'utf8')
  const result = await runThinker({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: [
      {
        id: 'optimize-input',
        text: buildOptimizerPrompt(original),
        createdAt: new Date().toISOString(),
      },
    ],
    results: [],
    tasks: [],
    history: [],
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  const candidate = normalizeOutput(result.output)
  if (!candidate) throw new Error('optimizer returned empty prompt')
  await mkdir(dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, candidate, 'utf8')
  return { original, candidate }
}

export const restorePrompt = async (
  promptPath: string,
  original: string,
): Promise<void> => {
  const resolvedPath = resolve(promptPath)
  await mkdir(dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, original, 'utf8')
}
