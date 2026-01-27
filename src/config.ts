import fs from 'node:fs/promises'
import path from 'node:path'

export type ResumePolicy = 'auto' | 'always' | 'never'
export type CodexSandbox =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access'

export type Config = {
  workspaceRoot: string
  codexBin?: string
  codexModel?: string
  codexProfile?: string
  codexSandbox?: CodexSandbox
  codexFullAuto?: boolean
  timeoutMs: number
  maxWorkers: number
  queueWarnMs: number
  maxIterations: number
  stateDir: string
  metricsPath: string
  lessonsPath: string
  lessonsEnabled: boolean
  memoryPaths: string[]
  maxMemoryHits: number
  maxMemoryChars: number
  resumePolicy: ResumePolicy
  outputPolicy: string
  guardRequireClean: boolean
  guardMaxChangedFiles?: number
  guardMaxChangedLines?: number
  triggerSessionKey: string
  triggerOnFailurePrompt?: string
  triggerOnLowScorePrompt?: string
}

const DEFAULT_OUTPUT_POLICY = `Output Policy:\n- Only output the final answer, no reasoning steps.\n- Keep it short, at most 6 lines; if longer, start with a summary.\n- Do not repeat the question or restate the context.`

export const getDefaultOutputPolicy = (): string => DEFAULT_OUTPUT_POLICY

type RawConfig = Partial<Config> & { memoryPaths?: unknown }

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseOptionalNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseStringArray = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : undefined
}

const resolvePath = (
  root: string,
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  return path.isAbsolute(value) ? value : path.join(root, value)
}

const readConfigFile = async (configPath: string): Promise<RawConfig> => {
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    return JSON.parse(raw) as RawConfig
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return {}
    throw error
  }
}

export const loadConfig = async (options?: {
  workspaceRoot?: string
  configPath?: string
}): Promise<Config> => {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd()
  const defaultStateDir = path.join(workspaceRoot, '.mimikit')
  const configPath =
    options?.configPath ??
    process.env.MIMIKIT_CONFIG ??
    path.join(defaultStateDir, 'config.json')

  const fileConfig = await readConfigFile(configPath)

  const stateDir =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_STATE_DIR ??
        (fileConfig.stateDir as string | undefined),
    ) ?? defaultStateDir
  const metricsPath =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_METRICS_PATH ??
        (fileConfig.metricsPath as string | undefined),
    ) ?? path.join(stateDir, 'metrics.jsonl')
  const lessonsPath =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_LESSONS_PATH ??
        (fileConfig.lessonsPath as string | undefined),
    ) ?? path.join(stateDir, 'lessons.md')
  const lessonsEnabled =
    parseBoolean(process.env.MIMIKIT_LESSONS_ENABLED) ??
    (fileConfig.lessonsEnabled as boolean | undefined) ??
    true
  const guardRequireClean =
    parseBoolean(process.env.MIMIKIT_GUARD_REQUIRE_CLEAN) ??
    (fileConfig.guardRequireClean as boolean | undefined) ??
    false
  const guardMaxChangedFiles =
    parseOptionalNumber(process.env.MIMIKIT_GUARD_MAX_CHANGED_FILES) ??
    (fileConfig.guardMaxChangedFiles as number | undefined)
  const guardMaxChangedLines =
    parseOptionalNumber(process.env.MIMIKIT_GUARD_MAX_CHANGED_LINES) ??
    (fileConfig.guardMaxChangedLines as number | undefined)
  const triggerSessionKey =
    process.env.MIMIKIT_TRIGGER_SESSION_KEY ??
    (fileConfig.triggerSessionKey as string | undefined) ??
    'system'
  const triggerOnFailurePrompt =
    process.env.MIMIKIT_TRIGGER_ON_FAILURE_PROMPT ??
    (fileConfig.triggerOnFailurePrompt as string | undefined)
  const triggerOnLowScorePrompt =
    process.env.MIMIKIT_TRIGGER_ON_LOW_SCORE_PROMPT ??
    (fileConfig.triggerOnLowScorePrompt as string | undefined)

  const memoryPaths =
    parseStringArray(process.env.MIMIKIT_MEMORY_PATHS) ??
    (Array.isArray(fileConfig.memoryPaths)
      ? (fileConfig.memoryPaths.filter(
          (item) => typeof item === 'string',
        ) as string[])
      : undefined) ??
    []

  const resumePolicy =
    (process.env.MIMIKIT_RESUME_POLICY as ResumePolicy | undefined) ??
    (fileConfig.resumePolicy as ResumePolicy | undefined) ??
    'auto'

  const outputPolicy =
    process.env.MIMIKIT_OUTPUT_POLICY ??
    (fileConfig.outputPolicy as string | undefined) ??
    DEFAULT_OUTPUT_POLICY

  const codexBin =
    process.env.MIMIKIT_CODEX_BIN ?? (fileConfig.codexBin as string | undefined)
  const codexModel =
    process.env.MIMIKIT_CODEX_MODEL ??
    (fileConfig.codexModel as string | undefined)
  const codexProfile =
    process.env.MIMIKIT_CODEX_PROFILE ??
    (fileConfig.codexProfile as string | undefined)
  const codexSandbox =
    (process.env.MIMIKIT_CODEX_SANDBOX as CodexSandbox | undefined) ??
    (fileConfig.codexSandbox as CodexSandbox | undefined)
  const codexFullAuto =
    parseBoolean(process.env.MIMIKIT_CODEX_FULL_AUTO) ??
    (fileConfig.codexFullAuto as boolean | undefined)

  const config: Config = {
    workspaceRoot,
    timeoutMs: parseNumber(
      process.env.MIMIKIT_TIMEOUT_MS,
      fileConfig.timeoutMs ?? 120_000,
    ),
    maxWorkers: parseNumber(
      process.env.MIMIKIT_MAX_WORKERS,
      fileConfig.maxWorkers ?? 5,
    ),
    queueWarnMs: parseNumber(
      process.env.MIMIKIT_QUEUE_WARN_MS,
      fileConfig.queueWarnMs ?? 10_000,
    ),
    maxIterations: Math.max(
      1,
      parseNumber(
        process.env.MIMIKIT_MAX_ITERATIONS,
        fileConfig.maxIterations ?? 2,
      ),
    ),
    stateDir,
    metricsPath,
    lessonsPath,
    lessonsEnabled,
    memoryPaths: memoryPaths.map(
      (value) => resolvePath(workspaceRoot, value) ?? value,
    ),
    maxMemoryHits: parseNumber(
      process.env.MIMIKIT_MAX_MEMORY_HITS,
      fileConfig.maxMemoryHits ?? 20,
    ),
    maxMemoryChars: parseNumber(
      process.env.MIMIKIT_MAX_MEMORY_CHARS,
      fileConfig.maxMemoryChars ?? 4_000,
    ),
    resumePolicy,
    outputPolicy,
    guardRequireClean,
    triggerSessionKey,
  }

  if (codexBin !== undefined) config.codexBin = codexBin
  if (codexModel !== undefined) config.codexModel = codexModel
  if (codexProfile !== undefined) config.codexProfile = codexProfile
  if (codexSandbox !== undefined) config.codexSandbox = codexSandbox
  if (codexFullAuto !== undefined) config.codexFullAuto = codexFullAuto
  if (guardMaxChangedFiles !== undefined)
    config.guardMaxChangedFiles = guardMaxChangedFiles
  if (guardMaxChangedLines !== undefined)
    config.guardMaxChangedLines = guardMaxChangedLines
  if (triggerOnFailurePrompt !== undefined)
    config.triggerOnFailurePrompt = triggerOnFailurePrompt
  if (triggerOnLowScorePrompt !== undefined)
    config.triggerOnLowScorePrompt = triggerOnLowScorePrompt

  return config
}
