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
  maxIterations: number
  stateDir: string
  taskLedgerMaxBytes: number
  taskLedgerMaxRecords: number
  taskLedgerAutoCompactIntervalMs: number
  heartbeatIntervalMs: number
  heartbeatPath: string
  memoryPaths: string[]
  maxMemoryHits: number
  maxMemoryChars: number
  resumePolicy: ResumePolicy
  outputPolicy: string
  selfEvalPrompt?: string
  selfEvalMaxChars: number
  selfEvalMemoryPath: string
  selfEvalMemoryMaxBytes: number
  selfEvalSkipSessionKeys: string[]
  selfImprovePrompt?: string
  selfImproveIntervalMs: number
  selfImproveMaxChars: number
  selfImproveSessionKey: string
  selfImproveStatePath: string
  triggerSessionKey: string
  triggerOnFailurePrompt?: string
  triggerOnIssuePrompt?: string
}

const DEFAULT_OUTPUT_POLICY = `Output Policy:\n- Only output the final answer, no reasoning steps.\n- Keep it short, at most 6 lines; if longer, start with a summary.\n- Do not repeat the question or restate the context.`
const DEFAULT_TASK_LEDGER_MAX_BYTES = 20_000
const DEFAULT_TASK_LEDGER_MAX_RECORDS = 1_000
const DEFAULT_TASK_LEDGER_COMPACT_INTERVAL_MS = 600_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_SELF_EVAL_MAX_CHARS = 4_000
const DEFAULT_SELF_EVAL_MEMORY_MAX_BYTES = 200_000
const DEFAULT_SELF_IMPROVE_MAX_CHARS = 4_000
const DEFAULT_SELF_IMPROVE_INTERVAL_MS = 0

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
  const triggerSessionKey =
    process.env.MIMIKIT_TRIGGER_SESSION_KEY ??
    (fileConfig.triggerSessionKey as string | undefined) ??
    'system'
  const triggerOnFailurePrompt =
    process.env.MIMIKIT_TRIGGER_ON_FAILURE_PROMPT ??
    (fileConfig.triggerOnFailurePrompt as string | undefined)
  const triggerOnIssuePrompt =
    process.env.MIMIKIT_TRIGGER_ON_ISSUE_PROMPT ??
    (fileConfig.triggerOnIssuePrompt as string | undefined)

  const selfEvalPromptRaw =
    process.env.MIMIKIT_SELF_EVAL_PROMPT ??
    (fileConfig.selfEvalPrompt as string | undefined)
  const selfEvalPrompt =
    typeof selfEvalPromptRaw === 'string' && selfEvalPromptRaw.trim().length > 0
      ? selfEvalPromptRaw
      : undefined
  const selfEvalSkipSessionKeysRaw =
    parseStringArray(process.env.MIMIKIT_SELF_EVAL_SKIP_SESSIONS) ??
    (Array.isArray(fileConfig.selfEvalSkipSessionKeys)
      ? (fileConfig.selfEvalSkipSessionKeys.filter(
          (item) => typeof item === 'string',
        ) as string[])
      : undefined) ??
    []
  const selfImprovePromptRaw =
    process.env.MIMIKIT_SELF_IMPROVE_PROMPT ??
    (fileConfig.selfImprovePrompt as string | undefined)
  const selfImprovePrompt =
    typeof selfImprovePromptRaw === 'string' &&
    selfImprovePromptRaw.trim().length > 0
      ? selfImprovePromptRaw
      : undefined

  const memoryPaths =
    parseStringArray(process.env.MIMIKIT_MEMORY_PATHS) ??
    (Array.isArray(fileConfig.memoryPaths)
      ? (fileConfig.memoryPaths.filter(
          (item) => typeof item === 'string',
        ) as string[])
      : undefined) ??
    []

  const taskLedgerMaxBytes = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_TASKS_COMPACT_BYTES,
      fileConfig.taskLedgerMaxBytes ?? DEFAULT_TASK_LEDGER_MAX_BYTES,
    ),
  )
  const taskLedgerMaxRecords = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_TASKS_COMPACT_RECORDS,
      fileConfig.taskLedgerMaxRecords ?? DEFAULT_TASK_LEDGER_MAX_RECORDS,
    ),
  )
  const taskLedgerAutoCompactIntervalMs = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_TASKS_COMPACT_INTERVAL_MS,
      fileConfig.taskLedgerAutoCompactIntervalMs ??
        DEFAULT_TASK_LEDGER_COMPACT_INTERVAL_MS,
    ),
  )
  const heartbeatIntervalMs = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_HEARTBEAT_INTERVAL_MS,
      fileConfig.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    ),
  )
  const heartbeatPath =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_HEARTBEAT_PATH ??
        (fileConfig.heartbeatPath as string | undefined),
    ) ?? path.join(stateDir, 'heartbeat.json')

  const resumePolicy =
    (process.env.MIMIKIT_RESUME_POLICY as ResumePolicy | undefined) ??
    (fileConfig.resumePolicy as ResumePolicy | undefined) ??
    'auto'

  const outputPolicy =
    process.env.MIMIKIT_OUTPUT_POLICY ??
    (fileConfig.outputPolicy as string | undefined) ??
    DEFAULT_OUTPUT_POLICY
  const selfEvalMaxChars = Math.max(
    200,
    parseNumber(
      process.env.MIMIKIT_SELF_EVAL_MAX_CHARS,
      fileConfig.selfEvalMaxChars ?? DEFAULT_SELF_EVAL_MAX_CHARS,
    ),
  )
  const selfEvalMemoryMaxBytes = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_SELF_EVAL_MEMORY_MAX_BYTES,
      fileConfig.selfEvalMemoryMaxBytes ?? DEFAULT_SELF_EVAL_MEMORY_MAX_BYTES,
    ),
  )
  const selfImproveMaxChars = Math.max(
    200,
    parseNumber(
      process.env.MIMIKIT_SELF_IMPROVE_MAX_CHARS,
      fileConfig.selfImproveMaxChars ?? DEFAULT_SELF_IMPROVE_MAX_CHARS,
    ),
  )
  const selfImproveIntervalMs = Math.max(
    0,
    parseNumber(
      process.env.MIMIKIT_SELF_IMPROVE_INTERVAL_MS,
      fileConfig.selfImproveIntervalMs ?? DEFAULT_SELF_IMPROVE_INTERVAL_MS,
    ),
  )
  const selfImproveSessionKey =
    process.env.MIMIKIT_SELF_IMPROVE_SESSION_KEY ??
    (fileConfig.selfImproveSessionKey as string | undefined) ??
    'self-improve'
  const selfEvalSkipSessionKeys =
    selfEvalSkipSessionKeysRaw.length > 0
      ? Array.from(new Set(selfEvalSkipSessionKeysRaw))
      : [selfImproveSessionKey]
  const selfEvalMemoryPath =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_SELF_EVAL_MEMORY_PATH ??
        (fileConfig.selfEvalMemoryPath as string | undefined),
    ) ?? path.join(workspaceRoot, 'memory', 'LESSONS.md')
  const selfImproveStatePath =
    resolvePath(
      workspaceRoot,
      process.env.MIMIKIT_SELF_IMPROVE_STATE_PATH ??
        (fileConfig.selfImproveStatePath as string | undefined),
    ) ?? path.join(stateDir, 'self-improve.json')

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
    maxWorkers: Math.max(
      1,
      parseNumber(process.env.MIMIKIT_MAX_WORKERS, fileConfig.maxWorkers ?? 5),
    ),
    maxIterations: Math.max(
      1,
      parseNumber(
        process.env.MIMIKIT_MAX_ITERATIONS,
        fileConfig.maxIterations ?? 2,
      ),
    ),
    stateDir,
    taskLedgerMaxBytes,
    taskLedgerMaxRecords,
    taskLedgerAutoCompactIntervalMs,
    heartbeatIntervalMs,
    heartbeatPath,
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
    selfEvalMaxChars,
    selfEvalMemoryPath,
    selfEvalMemoryMaxBytes,
    selfEvalSkipSessionKeys,
    selfImproveMaxChars,
    selfImproveIntervalMs,
    selfImproveSessionKey,
    selfImproveStatePath,
    triggerSessionKey,
  }

  if (codexBin !== undefined) config.codexBin = codexBin
  if (codexModel !== undefined) config.codexModel = codexModel
  if (codexProfile !== undefined) config.codexProfile = codexProfile
  if (codexSandbox !== undefined) config.codexSandbox = codexSandbox
  if (codexFullAuto !== undefined) config.codexFullAuto = codexFullAuto
  if (triggerOnFailurePrompt !== undefined)
    config.triggerOnFailurePrompt = triggerOnFailurePrompt
  if (triggerOnIssuePrompt !== undefined)
    config.triggerOnIssuePrompt = triggerOnIssuePrompt
  if (selfEvalPrompt !== undefined) config.selfEvalPrompt = selfEvalPrompt
  if (selfImprovePrompt !== undefined)
    config.selfImprovePrompt = selfImprovePrompt

  return config
}
