import { readJson, writeJson } from '../fs/json.js'

import type { ThinkerState } from '../types/thinker-state.js'

const DEFAULT_STATE: ThinkerState = {
  sessionId: '',
  lastWakeAt: '',
  notes: '',
}

export const readThinkerState = (path: string): Promise<ThinkerState> =>
  readJson<ThinkerState>(path, DEFAULT_STATE, { useBackup: true })

export const writeThinkerState = async (
  path: string,
  state: ThinkerState,
): Promise<void> => {
  await writeJson(path, state)
}
