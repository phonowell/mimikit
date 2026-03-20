import { truncateText } from '../shared/text.js'

import { stringifyPromptJson } from './format-base.js'

export type ManagerDigestSection =
  | 'recent_history'
  | 'query_lookup'
  | 'batch_results'

export type ManagerSectionDigestStat = {
  section: ManagerDigestSection
  mode: 'digest'
  sourceBytes: number
  digestBytes: number
  sourceItems: number
  digestItems: number
  sourceRefCount: number
}

export type SectionDigest = {
  text: string
  stat: ManagerSectionDigestStat
}

export type DigestItem = Record<string, unknown>

export const DIGEST_SUMMARY_MAX_CHARS = 160

const countBytes = (value: string): number => Buffer.byteLength(value, 'utf8')

export const buildDigest = (params: {
  section: ManagerDigestSection
  sourceText: string
  sourceItems: number
  sourceRefs: string[]
  truncated: boolean
  summary: Record<string, unknown>
  items: DigestItem[]
}): SectionDigest => {
  const text = stringifyPromptJson({
    mode: 'digest',
    summary: params.summary,
    source_refs: params.sourceRefs,
    truncated: params.truncated,
    stats: {
      source_bytes: countBytes(params.sourceText),
      digest_bytes: 0,
      source_items: params.sourceItems,
      digest_items: params.items.length,
      source_ref_count: params.sourceRefs.length,
    },
    items: params.items,
  })
  const digestBytes = countBytes(text)
  const normalizedText = stringifyPromptJson({
    mode: 'digest',
    summary: params.summary,
    source_refs: params.sourceRefs,
    truncated: params.truncated,
    stats: {
      source_bytes: countBytes(params.sourceText),
      digest_bytes: digestBytes,
      source_items: params.sourceItems,
      digest_items: params.items.length,
      source_ref_count: params.sourceRefs.length,
    },
    items: params.items,
  })
  return {
    text: normalizedText,
    stat: {
      section: params.section,
      mode: 'digest',
      sourceBytes: countBytes(params.sourceText),
      digestBytes: countBytes(normalizedText),
      sourceItems: params.sourceItems,
      digestItems: params.items.length,
      sourceRefCount: params.sourceRefs.length,
    },
  }
}

export const buildCountSummary = (
  items: Array<{ key: string }>,
): Array<{ key: string; count: number }> => {
  const counts = new Map<string, number>()
  for (const item of items)
    counts.set(item.key, (counts.get(item.key) ?? 0) + 1)

  return Array.from(counts.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))
}

export const buildQueryScopeItems = (params: {
  scope: string
  items: Record<string, unknown>[]
  limit: number
}): DigestItem[] =>
  params.items.slice(0, params.limit).map((item) => ({
    scope: params.scope,
    ...(typeof item.ref === 'string' ? { ref: item.ref } : {}),
    ...(typeof item.id === 'string' ? { id: item.id } : {}),
    ...(typeof item.taskId === 'string' ? { task_id: item.taskId } : {}),
    ...(typeof item.path === 'string' ? { path: item.path } : {}),
    ...(typeof item.status === 'string' ? { status: item.status } : {}),
    ...(typeof item.score === 'number' ? { score: item.score } : {}),
    ...(typeof item.title === 'string'
      ? {
          title: truncateText(item.title, DIGEST_SUMMARY_MAX_CHARS, {
            normalizeWhitespace: true,
            suffix: '…',
          }),
        }
      : {}),
    ...(typeof item.summary === 'string'
      ? {
          summary: truncateText(item.summary, DIGEST_SUMMARY_MAX_CHARS, {
            normalizeWhitespace: true,
            suffix: '…',
          }),
        }
      : {}),
    ...(typeof item.snippet === 'string'
      ? {
          snippet: truncateText(item.snippet, DIGEST_SUMMARY_MAX_CHARS, {
            normalizeWhitespace: true,
            suffix: '…',
          }),
        }
      : {}),
  }))
