import { join } from 'node:path'

import { listItems, readItem, removeItem, writeItem } from './queue.js'

import type { Trigger } from '../types/tasks.js'

export const listTriggers = (dir: string): Promise<Trigger[]> =>
  listItems<Trigger>(dir)

export const writeTrigger = async (
  dir: string,
  trigger: Trigger,
): Promise<void> => {
  await writeItem(dir, trigger.id, trigger)
}

export const readTrigger = (dir: string, id: string): Promise<Trigger | null> =>
  readItem<Trigger>(join(dir, `${id}.json`))

export const removeTrigger = async (dir: string, id: string): Promise<void> => {
  await removeItem(join(dir, `${id}.json`))
}
