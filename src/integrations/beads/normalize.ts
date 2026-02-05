import type { BeadsIssueSummary } from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const filtered = value.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  )
  return filtered.length > 0 ? filtered : undefined
}

const toIssueSummary = (value: unknown): BeadsIssueSummary | null => {
  if (!isRecord(value)) return null
  const issue = isRecord(value.issue) ? value.issue : value
  const id = asString(issue.id)
  const title = asString(issue.title)
  if (!id || !title) return null
  const summary: BeadsIssueSummary = { id, title }
  const status = asString(issue.status)
  if (status) summary.status = status
  const priority = asNumber(issue.priority)
  if (priority !== undefined) summary.priority = priority
  const issueType = asString(issue.issue_type)
  if (issueType) summary.issueType = issueType
  const labels = asStringArray(issue.labels)
  if (labels) summary.labels = labels
  const assignee = asString(issue.assignee)
  if (assignee) summary.assignee = assignee
  const updatedAt = asString(issue.updated_at)
  if (updatedAt) summary.updatedAt = updatedAt
  return summary
}

export const extractIssues = (payload: unknown): BeadsIssueSummary[] => {
  if (Array.isArray(payload)) {
    return payload
      .map(toIssueSummary)
      .filter((item): item is BeadsIssueSummary => item !== null)
  }
  if (isRecord(payload) && Array.isArray(payload.issues)) {
    return payload.issues
      .map(toIssueSummary)
      .filter((item): item is BeadsIssueSummary => item !== null)
  }
  return []
}

export const extractIssueId = (payload: unknown): string | undefined => {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const summary = toIssueSummary(item)
      if (summary?.id) return summary.id
    }
    return undefined
  }
  if (isRecord(payload) && typeof payload.id === 'string') return payload.id
  if (isRecord(payload) && isRecord(payload.issue)) {
    const id = asString(payload.issue.id)
    if (id) return id
  }
  return undefined
}
