export type BackgroundJobSource = 'memory_refresh'

export type BackgroundWriteDomain = 'memory' | 'runtime_meta'

export type BackgroundJobSpec = {
  source: BackgroundJobSource
  summary: string
  allowedWriteDomains: readonly BackgroundWriteDomain[]
  auditEvents: {
    requested: string
    started: string
    succeeded: string
    failed: string
  }
}

const BACKGROUND_JOB_SPECS: Record<BackgroundJobSource, BackgroundJobSpec> = {
  memory_refresh: {
    source: 'memory_refresh',
    summary: 'Refresh long-term memory from stable user/system signals only.',
    allowedWriteDomains: ['memory', 'runtime_meta'],
    auditEvents: {
      requested: 'memory_refresh_requested',
      started: 'memory_refresh_started',
      succeeded: 'memory_refresh_succeeded',
      failed: 'memory_refresh_failed',
    },
  },
}

export const getBackgroundJobSpec = (
  source: BackgroundJobSource,
): BackgroundJobSpec => BACKGROUND_JOB_SPECS[source]

export const listBackgroundJobSpecs = (): BackgroundJobSpec[] =>
  Object.values(BACKGROUND_JOB_SPECS)

export const assertBackgroundWriteAllowed = (
  source: BackgroundJobSource,
  domain: BackgroundWriteDomain,
): void => {
  const allowed = getBackgroundJobSpec(source).allowedWriteDomains
  if (allowed.includes(domain)) return
  throw new Error(`background_write_forbidden:${source}:${domain}`)
}
