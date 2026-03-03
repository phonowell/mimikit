import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { qqConfigSchema } from './channels/qq/config.js'
const modelReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])
const taskDefaultsSchema = z
  .object({
    timeoutMs: z.number().int().positive(),
    model: z.string().min(1),
    modelReasoningEffort: modelReasoningEffortSchema,
  })
  .strict()
const defaultConfigSchema = z
  .object({
    manager: z
      .object({
        model: z.string().min(1),
        maxCorrectionRounds: z.number().int().positive(),
        promptSections: z
          .object({
            actionFeedbackMaxBytes: z.number().int().positive(),
            batchResultsMaxBytes: z.number().int().positive(),
            compressedContextMaxBytes: z.number().int().positive(),
            environmentMaxBytes: z.number().int().positive(),
            fileLookupMaxBytes: z.number().int().positive(),
            focusContextsMaxBytes: z.number().int().positive(),
            focusListMaxBytes: z.number().int().positive(),
            historyLookupMaxBytes: z.number().int().positive(),
            inputsMaxBytes: z.number().int().positive(),
            memoryMaxBytes: z.number().int().positive(),
            plansMaxBytes: z.number().int().positive(),
            recentHistoryMaxBytes: z.number().int().positive(),
            tasksMaxBytes: z.number().int().positive(),
          })
          .strict(),
        taskCreate: z
          .object({
            debounceMs: z.number().int().nonnegative(),
          })
          .strict(),
        idleTrigger: z
          .object({
            delayMs: z.number().int().nonnegative(),
          })
          .strict(),
        taskWindow: z
          .object({
            maxCount: z.number().int().positive(),
            minCount: z.number().int().positive(),
          })
          .strict(),
        planWindow: z
          .object({
            maxCount: z.number().int().positive(),
            minCount: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    worker: z
      .object({
        maxConcurrent: z.number().int().positive(),
        retry: z
          .object({
            maxAttempts: z.number().int().nonnegative(),
            backoffMs: z.number().int().nonnegative(),
          })
          .strict(),
        ...taskDefaultsSchema.shape,
      })
      .strict(),
    qq: qqConfigSchema,
  })
  .strict()
type AppDefaults = z.infer<typeof defaultConfigSchema>
export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../config.yaml', import.meta.url),
)
export const DEFAULT_CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL('../config.yaml.default', import.meta.url),
)
const readOrCreateConfigSource = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'ENOENT') throw error
  }
  const fallbackSource = readFileSync(DEFAULT_CONFIG_TEMPLATE_PATH, 'utf8')
  try {
    writeFileSync(path, fallbackSource, { encoding: 'utf8', flag: 'wx' })
    return fallbackSource
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== 'EEXIST') throw error
    return readFileSync(path, 'utf8')
  }
}
const parseDefaultConfigYaml = (source: string): AppDefaults => {
  const parsed = parseYaml(source) as unknown
  const validated = defaultConfigSchema.safeParse(parsed)
  if (validated.success) {
    if (
      validated.data.manager.taskWindow.minCount >
      validated.data.manager.taskWindow.maxCount
    ) {
      throw new Error(
        '[config] invalid yaml defaults: manager.taskWindow.minCount must be <= manager.taskWindow.maxCount',
      )
    }
    if (
      validated.data.manager.planWindow.minCount >
      validated.data.manager.planWindow.maxCount
    ) {
      throw new Error(
        '[config] invalid yaml defaults: manager.planWindow.minCount must be <= manager.planWindow.maxCount',
      )
    }
    return validated.data
  }
  const issues = validated.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
  throw new Error(`[config] invalid yaml defaults: ${issues}`)
}
export const loadDefaultConfigFromYaml = (
  path = DEFAULT_CONFIG_PATH,
): AppDefaults => {
  const source = readOrCreateConfigSource(path)
  return parseDefaultConfigYaml(source)
}
