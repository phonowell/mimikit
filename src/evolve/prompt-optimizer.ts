import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { buildPromptOptimizerPrompt } from '../prompts/build-prompts.js'
import { runThinker } from '../thinker/runner.js'

type OptimizeResult = {
  original: string
  candidate: string
}

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
        text: await buildPromptOptimizerPrompt({
          workDir: params.workDir,
          source: original,
        }),
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
