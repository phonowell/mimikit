import { join } from 'node:path'

import { z } from 'zod'

import { taskContractSchema } from '../../foundation/shared/task-contract-schema.js'
import { newId, nowIso } from '../../foundation/shared/utils.js'
import { readJson, writeJson } from '../../persistence/fs/json.js'

import type { TaskContract } from '../../foundation/types/index.js'

const taskExecutionSpecSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    contract: taskContractSchema.optional(),
  })
  .strict()

export type TaskExecutionSpec = z.infer<typeof taskExecutionSpecSchema>

const executionSpecPath = (stateDir: string, specId: string): string =>
  join(stateDir, 'specs', `${specId}.json`)

const cloneTaskContract = (contract: TaskContract): TaskContract => ({
  goal: contract.goal,
  scope: contract.scope,
  acceptance: [...contract.acceptance],
  ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
  ...(contract.contextRefs ? { contextRefs: [...contract.contextRefs] } : {}),
})

export const createTaskExecutionSpec = (params: {
  prompt: string
  contract?: TaskContract
  specId?: string
}): TaskExecutionSpec => ({
  id: params.specId?.trim() ?? `spec-${newId()}`,
  createdAt: nowIso(),
  prompt: params.prompt.trim(),
  ...(params.contract ? { contract: cloneTaskContract(params.contract) } : {}),
})

export const writeTaskExecutionSpec = async (
  stateDir: string,
  spec: TaskExecutionSpec,
): Promise<void> => {
  await writeJson(executionSpecPath(stateDir, spec.id), spec)
}

export const persistTaskExecutionSpec = async (params: {
  stateDir: string
  prompt: string
  contract?: TaskContract
  specId?: string
}): Promise<TaskExecutionSpec> => {
  const spec = createTaskExecutionSpec(params)
  await writeTaskExecutionSpec(params.stateDir, spec)
  return spec
}

export const readTaskExecutionSpec = async (
  stateDir: string,
  specId: string,
): Promise<TaskExecutionSpec> => {
  const path = executionSpecPath(stateDir, specId)
  const raw = await readJson<unknown | null>(path, null)
  if (!raw) throw new Error(`missing_task_execution_spec:${specId}`)
  return taskExecutionSpecSchema.parse(raw)
}
