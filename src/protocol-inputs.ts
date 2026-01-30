import { readFile, writeFile } from 'node:fs/promises'

import { withLock } from './protocol-utils.js'

import type { ProtocolPaths } from './protocol-paths.js'
import type { UserInput } from './protocol-types.js'

export const getUserInputs = async (
  paths: ProtocolPaths,
): Promise<UserInput[]> => {
  try {
    const data = await readFile(paths.userInputPath, 'utf-8')
    return JSON.parse(data) as UserInput[]
  } catch {
    return []
  }
}

export const addUserInput = async (
  paths: ProtocolPaths,
  input: UserInput,
): Promise<void> => {
  await withLock(paths.userInputPath, async () => {
    const inputs = await getUserInputs(paths)
    inputs.push(input)
    await writeFile(paths.userInputPath, JSON.stringify(inputs, null, 2))
  })
}

export const removeUserInputs = async (
  paths: ProtocolPaths,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return
  await withLock(paths.userInputPath, async () => {
    const inputs = await getUserInputs(paths)
    const idSet = new Set(ids)
    const remaining = inputs.filter((input) => !idSet.has(input.id))
    if (remaining.length === inputs.length) return
    await writeFile(paths.userInputPath, JSON.stringify(remaining, null, 2))
  })
}

export const clearUserInputs = (paths: ProtocolPaths): Promise<UserInput[]> =>
  withLock(paths.userInputPath, async () => {
    const inputs = await getUserInputs(paths)
    await writeFile(paths.userInputPath, '[]')
    return inputs
  })
