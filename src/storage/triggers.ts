import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { listJsonPaths } from './dir.js'

import type { Trigger } from '../types/tasks.js'

export const listTriggers = async (dir: string): Promise<Trigger[]> => {
  const paths = await listJsonPaths(dir)
  const triggers: Trigger[] = []
  for (const path of paths) {
    const trigger = await readJson<Trigger | null>(path, null)
    if (trigger) triggers.push(trigger)
  }
  return triggers
}

export const writeTrigger = async (
  dir: string,
  trigger: Trigger,
): Promise<void> => {
  await writeJson(join(dir, `${trigger.id}.json`), trigger)
}

export const readTrigger = (dir: string, id: string): Promise<Trigger | null> =>
  readJson<Trigger | null>(join(dir, `${id}.json`), null)

export const removeTrigger = async (dir: string, id: string): Promise<void> => {
  try {
    await import('node:fs/promises').then((fs) =>
      fs.unlink(join(dir, `${id}.json`)),
    )
  } catch {
    // ignore
  }
}
