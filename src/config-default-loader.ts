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
    deferred: z
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
      validated.data.deferred.tasksMinCount >
      validated.data.deferred.tasksMaxCount
    ) {
      throw new Error(
        '[config] invalid yaml defaults: deferred.tasksMinCount must be <= deferred.tasksMaxCount',
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
