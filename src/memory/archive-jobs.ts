import { readJson, writeJson } from '../fs/json.js'

export type ArchiveJob = {
  id: string
  messageIds: string[]
  outputPath?: string
}

export type ArchiveJobIndex = Record<string, ArchiveJob>

export const readArchiveJobs = (path: string): Promise<ArchiveJobIndex> =>
  readJson<ArchiveJobIndex>(path, {})

export const writeArchiveJobs = async (
  path: string,
  index: ArchiveJobIndex,
): Promise<void> => {
  await writeJson(path, index)
}

export const addArchiveJob = async (
  path: string,
  job: ArchiveJob,
): Promise<void> => {
  const index = await readArchiveJobs(path)
  index[job.id] = job
  await writeArchiveJobs(path, index)
}

export const removeArchiveJob = async (
  path: string,
  id: string,
): Promise<void> => {
  const index = await readArchiveJobs(path)
  delete index[id]
  await writeArchiveJobs(path, index)
}
