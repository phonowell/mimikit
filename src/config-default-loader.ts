import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

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
  })
  .strict()

const codexTaskDefaultsSchema = z
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
        promptMaxTokens: z.number().int().positive(),
        createTaskDebounceMs: z.number().int().nonnegative(),
        tasksMaxCount: z.number().int().positive(),
        tasksMinCount: z.number().int().positive(),
        tasksMaxBytes: z.number().int().positive(),
        model: z.string().min(1),
        task: taskDefaultsSchema,
      })
      .strict(),
    evolver: z
      .object({
        enabled: z.boolean(),
        pollMs: z.number().int().positive(),
        idleThresholdMs: z.number().int().positive(),
        minIntervalMs: z.number().int().positive(),
      })
      .strict(),
    worker: z
      .object({
        maxConcurrent: z.number().int().positive(),
        retryMaxAttempts: z.number().int().nonnegative(),
        retryBackoffMs: z.number().int().nonnegative(),
        standard: taskDefaultsSchema,
        specialist: codexTaskDefaultsSchema,
      })
      .strict(),
  })
  .strict()

type AppDefaults = z.infer<typeof defaultConfigSchema>

export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../config/default.yaml', import.meta.url),
)

const parseDefaultConfigYaml = (source: string): AppDefaults => {
  const parsed = parseYaml(source) as unknown
  const validated = defaultConfigSchema.safeParse(parsed)
  if (validated.success) {
    if (
      validated.data.manager.tasksMinCount >
      validated.data.manager.tasksMaxCount
    ) {
      throw new Error(
        '[config] invalid yaml defaults: manager.tasksMinCount must be <= manager.tasksMaxCount',
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
  const source = readFileSync(path, 'utf8')
  return parseDefaultConfigYaml(source)
}
