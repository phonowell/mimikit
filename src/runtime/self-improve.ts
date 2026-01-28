import crypto from 'node:crypto'
import fs from 'node:fs/promises'

import { readJsonFile, writeJsonFile } from '../utils/fs.js'

import type { Config, ResumePolicy } from '../config.js'

type SelfImproveState = {
  lastHash?: string
  lastRunAt?: string
}

type EnqueueTask = (request: {
  sessionKey: string
  prompt: string
  resume?: ResumePolicy
}) => Promise<unknown>

const readTail = async (
  filePath: string,
  maxChars: number,
): Promise<string> => {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(filePath, 'r')
    const stats = await handle.stat()
    if (stats.size === 0) return ''
    const start = Math.max(0, stats.size - maxChars)
    const length = stats.size - start
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    return buffer.toString('utf8').trim()
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return ''
    throw error
  } finally {
    if (handle) await handle.close()
  }
}

const hashText = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex')

const buildPrompt = (base: string, lessons: string): string =>
  [
    base.trim(),
    '',
    'Lessons:',
    lessons.trim(),
    '',
    'Return a single minimal improvement task or NO_CHANGE.',
  ].join('\n')

export const startSelfImprove = (params: {
  config: Config
  enqueueTask: EnqueueTask
}): void => {
  const { config } = params
  const basePrompt = config.selfImprovePrompt?.trim()
  if (!basePrompt) return
  if (config.selfImproveIntervalMs <= 0) return

  let running = false
  const run = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const lessons = await readTail(
        config.selfEvalMemoryPath,
        config.selfImproveMaxChars,
      )
      if (!lessons) return

      const currentHash = hashText(lessons)
      const state = await readJsonFile<SelfImproveState>(
        config.selfImproveStatePath,
        {},
      )
      if (state.lastHash === currentHash) return

      const updatedState: SelfImproveState = {
        lastHash: currentHash,
        lastRunAt: new Date().toISOString(),
      }
      await writeJsonFile(config.selfImproveStatePath, updatedState)

      const prompt = buildPrompt(basePrompt, lessons)
      await params.enqueueTask({
        sessionKey: config.selfImproveSessionKey,
        prompt,
        resume: 'never',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`self-improve failed: ${message}`)
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(() => {
    void run()
  }, config.selfImproveIntervalMs)
  timer.unref()
}
