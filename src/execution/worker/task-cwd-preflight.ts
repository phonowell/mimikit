import { statSync } from 'node:fs'

import { buildProviderPreflightError } from '../providers/provider-error.js'

export const assertTaskCwdAvailableForAttempt = (params: {
  taskId: string
  cwd: string
  attempt: number
  providerId: string
}): void => {
  try {
    if (statSync(params.cwd).isDirectory()) return
  } catch {
    // Fall through to the canonical preflight error below.
  }

  const retryLabel =
    params.attempt > 1 ? ` before retry attempt ${params.attempt}` : ''
  throw buildProviderPreflightError({
    providerId: params.providerId,
    message: `task working directory is missing${retryLabel}: ${params.cwd} (task=${params.taskId})`,
  })
}
