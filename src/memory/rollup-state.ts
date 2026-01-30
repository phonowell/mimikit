import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type RollupState = {
  daily?: Record<string, string>
  monthly?: Record<string, string>
  lastRunAt?: string
}

const rollupStatePath = (stateDir: string): string =>
  join(stateDir, 'memory_rollup.json')

export const readMemoryRollupState = async (
  stateDir: string,
): Promise<RollupState> => {
  try {
    const data = await readFile(rollupStatePath(stateDir), 'utf-8')
    return JSON.parse(data) as RollupState
  } catch {
    return {}
  }
}

export const writeMemoryRollupState = async (
  stateDir: string,
  state: RollupState,
): Promise<void> => {
  await writeFile(rollupStatePath(stateDir), JSON.stringify(state, null, 2))
}
