import { readJson, writeJson } from '../../fs/json.js'

import { runMemoryRefreshSingleCall } from './single-call.js'

import type {
  MemoryRefreshPayload,
  MemoryRefreshSubprocessResult,
} from './types.js'

const main = async (): Promise<void> => {
  const inputPath = process.argv[2]?.trim()
  const outputPath = process.argv[3]?.trim()
  if (!inputPath || !outputPath)
    throw new Error('memory_refresh_subprocess_invalid_args')

  const payload = await readJson<MemoryRefreshPayload | null>(inputPath, null)
  if (!payload) throw new Error('memory_refresh_subprocess_missing_input')

  const output: MemoryRefreshSubprocessResult =
    await runMemoryRefreshSingleCall({
      payload,
    })
  await writeJson(outputPath, output)
}

await main()
