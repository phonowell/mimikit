export type ScoreWindowType = 'daily' | 'release-window'
export type ScoreStatus = 'stable' | 'unstable'
export type ScoreKind = 'na' | 'not_collected'
export type ScoreValue = number | ScoreKind

export type ScoreThreshold = {
  min?: number
  max?: number
}

export type ScoreInput = {
  workDir: string
  windowType: ScoreWindowType
  windowFrom: string
  windowTo: string
  version: string
  goldenSetPath: string
}

export type ScoreOutput = {
  window: {
    type: ScoreWindowType
    from: string
    to: string
  }
  version: string
  collectedAt: string
  dataOverview: {
    totalResults: number
    succeededResults: number
    failedResults: number
    canceledResults: number
    taskSuccessRate: number
    taskFailRate: number
    taskCancelRate: number
  }
  governance: Record<string, ScoreValue>
  thresholds: Record<string, ScoreThreshold>
  counts: {
    naCount: number
    notCollectedCount: number
  }
  status: ScoreStatus
  blockers: string[]
}

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}

export type TaskResultPacket = {
  taskId: string
  status: 'succeeded' | 'failed' | 'canceled'
  completedAt: string
  evidence?: {
    contractGoal?: string
    acceptanceChecks?: Array<{
      criterion?: string
      met?: boolean
      note?: string
    }>
    stateDelta?: {
      taskStatusTo?: string
    }
  }
}

export type InputPacket = {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  createdAt: string
  focusId: string
  quote?: string
}

export type TaskProgressRow = {
  type?: string
}

export type LogRow = {
  time?: string
  event?: string
  status?: string
  triggerMode?: string
  triggerReason?: string
  outcome?: string
  policy?: string
  wakeProfile?: string
  inputCount?: number
  resultCount?: number
  activeFocusCount?: number
  usedBytes?: number
  resultScopeCount?: number
  mode?: string
  planId?: string
  taskId?: string
  promptSectionLimits?: Record<string, number>
}

export type GoldenCase = {
  id: string
  optional?: boolean
  expected: {
    status?: 'succeeded' | 'failed' | 'canceled'
    requireEvidence?: boolean
  }
}

export const DEFAULT_VERSION = 'v1.3-stable'
export const DEFAULT_WINDOW_TYPE: ScoreWindowType = 'daily'
export const DEFAULT_GOLDEN_SET_PATH = 'overflows/golden-set-example.json'

const toIsoDayStart = (day: string): string => `${day}T00:00:00.000Z`
const toIsoDayEnd = (day: string): string => `${day}T23:59:59.999Z`

export const parseArg = (name: string): string | undefined => {
  const prefix = `--${name}=`
  const entry = process.argv.find((item) => item.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : undefined
}

const parseWindowType = (value?: string): ScoreWindowType => {
  if (value === 'daily' || value === 'release-window') return value
  return DEFAULT_WINDOW_TYPE
}

export const requireWindowInput = (): ScoreInput => {
  const workDir = parseArg('work-dir') ?? '.mimikit'
  const windowType = parseWindowType(parseArg('window-type'))
  const from = parseArg('from')
  const to = parseArg('to')
  if (!from || !to)
    throw new Error(
      'missing required window args: --from=YYYY-MM-DD --to=YYYY-MM-DD',
    )
  return {
    workDir,
    windowType,
    windowFrom: toIsoDayStart(from),
    windowTo: toIsoDayEnd(to),
    version: parseArg('version') ?? DEFAULT_VERSION,
    goldenSetPath: parseArg('golden-set') ?? DEFAULT_GOLDEN_SET_PATH,
  }
}

export const toMs = (value?: string): number | undefined => {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

export const withFourDecimals = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(4)) : 0

export const ratio = (num: number, den: number): ScoreValue => {
  if (den === 0) return 'na'
  return withFourDecimals(num / den)
}

export const isInRange = (time: string, from: string, to: string): boolean =>
  time >= from && time <= to

export const normalizeText = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

export const percentile = (values: number[], p: number): number | undefined => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  )
  return sorted[rank]
}
