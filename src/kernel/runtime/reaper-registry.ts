import { rm } from 'node:fs/promises'

import { sleep } from '../../foundation/shared/utils.js'
import { readJson, writeJson } from '../../persistence/fs/json.js'

import { READ_RETRY_MAX, READ_RETRY_WAIT_MS } from './reaper-constants.js'

import type { ChildrenRegistry, LeaseRecord } from './reaper-types.js'

export const readChildrenRegistry = async (
  path: string,
): Promise<ChildrenRegistry> => {
  for (let attempt = 0; attempt <= READ_RETRY_MAX; attempt += 1) {
    const content = await readJson<ChildrenRegistry>(
      path,
      { items: [] },
      { quietParseError: true },
    )
    if (Array.isArray(content.items)) return content
    if (attempt >= READ_RETRY_MAX) break
    await sleep(READ_RETRY_WAIT_MS)
  }
  return { items: [] }
}

export const writeChildrenRegistry = async (
  path: string,
  value: ChildrenRegistry,
): Promise<void> => {
  await writeJson(path, {
    items: value.items,
  })
}

export const readLease = (path: string): Promise<LeaseRecord | null> =>
  readJson<LeaseRecord | null>(path, null, {
    quietParseError: true,
  })

export const writeLease = async (params: {
  path: string
  value: LeaseRecord
}): Promise<void> => {
  await writeJson(params.path, params.value)
}

export const removeLeaseFileIfExists = async (path: string): Promise<void> => {
  await rm(path, { force: true }).catch(() => undefined)
}

export const removeChildById = async (
  path: string,
  id: string,
): Promise<void> => {
  const registry = await readChildrenRegistry(path)
  const next = registry.items.filter((item) => item.id !== id)
  if (next.length === registry.items.length) return
  await writeChildrenRegistry(path, { items: next })
}

export const upsertChild = async (params: {
  path: string
  item: ChildrenRegistry['items'][number]
}): Promise<void> => {
  const registry = await readChildrenRegistry(params.path)
  const without = registry.items.filter((entry) => entry.id !== params.item.id)
  without.push(params.item)
  await writeChildrenRegistry(params.path, { items: without })
}
