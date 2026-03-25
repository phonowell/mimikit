import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../../work/orchestrator/task-state.js'
import {
  persistTaskExecutionSpec,
  readTaskExecutionSpec,
} from '../../work/spec/store.js'

import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { PlanEffectAttrs } from './action-plan-effect-schema.js'
import type {
  TaskContract,
  TaskPlanEffect,
} from '../../foundation/types/index.js'

type EnqueueTaskAttrs = Pick<
  PlanEffectAttrs,
  | 'task_title'
  | 'task_worker_prompt'
  | 'task_goal'
  | 'task_in_scope'
  | 'task_done_when_1'
  | 'task_done_when_2'
  | 'task_done_when_3'
  | 'task_done_when_4'
  | 'task_done_when_5'
  | 'task_out_of_scope'
  | 'task_context_ref_1'
  | 'task_context_ref_2'
  | 'task_context_ref_3'
>

const toTaskContractAttrs = (
  params: EnqueueTaskAttrs,
): Record<string, string | undefined> => ({
  title: params.task_title,
  worker_prompt: params.task_worker_prompt,
  goal: params.task_goal,
  in_scope: params.task_in_scope,
  done_when_1: params.task_done_when_1,
  done_when_2: params.task_done_when_2,
  done_when_3: params.task_done_when_3,
  done_when_4: params.task_done_when_4,
  done_when_5: params.task_done_when_5,
  out_of_scope: params.task_out_of_scope,
  context_ref_1: params.task_context_ref_1,
  context_ref_2: params.task_context_ref_2,
  context_ref_3: params.task_context_ref_3,
})

const buildEnqueueTaskEffect = async (params: {
  stateDir: string
  focusId: string
  title: string
  cwd: string
  branch?: string | undefined
  prompt: string
  contract: TaskContract
}): Promise<TaskPlanEffect> => {
  const spec = await persistTaskExecutionSpec({
    stateDir: params.stateDir,
    prompt: params.prompt,
    contract: params.contract,
  })
  const fingerprint = buildTaskFingerprint({
    prompt: params.prompt,
    title: params.title,
    cwd: params.cwd,
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    ...(params.branch ? { branch: params.branch } : {}),
    contract: params.contract,
  })
  const semanticKey = buildTaskSemanticKey({
    prompt: params.prompt,
    title: params.title,
    cwd: params.cwd,
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    ...(params.branch ? { branch: params.branch } : {}),
    contract: params.contract,
  })
  return {
    kind: 'enqueue_task',
    taskTemplate: {
      title: params.title,
      executionSpecId: spec.id,
      fingerprint,
      semanticKey,
      cwd: params.cwd,
      ...(params.branch ? { branch: params.branch } : {}),
    },
  }
}

export const buildPlanEnqueueTaskEffect = (params: {
  stateDir: string
  attrs: PlanEffectAttrs
  focusId: string
}): Promise<TaskPlanEffect> => {
  const taskAttrs = toTaskContractAttrs(params.attrs)
  const contract = buildTaskContractFromAttrs(taskAttrs)
  const prompt = resolveWorkerPromptFromAttrs(taskAttrs)
  if (!contract || !prompt)
    throw new Error('invalid_plan_effect: enqueue_task contract missing')
  return buildEnqueueTaskEffect({
    stateDir: params.stateDir,
    focusId: params.focusId,
    title: params.attrs.task_title?.trim() ?? '',
    cwd: params.attrs.task_cwd?.trim() ?? '',
    prompt,
    contract,
    ...(params.attrs.task_branch?.trim()
      ? { branch: params.attrs.task_branch.trim() }
      : {}),
  })
}

export const resolveUpdatedPlanEnqueueTaskEffect = async (params: {
  stateDir: string
  current: Extract<TaskPlanEffect, { kind: 'enqueue_task' }>
  update: PlanEffectAttrs
  focusId: string
}): Promise<TaskPlanEffect> => {
  const currentSpec = await readTaskExecutionSpec(
    params.stateDir,
    params.current.taskTemplate.executionSpecId,
  )
  const currentContract = currentSpec.contract
  const nextTaskAttrs = {
    task_context_ref_1:
      params.update.task_context_ref_1 ?? currentContract?.contextRefs?.[0],
    task_context_ref_2:
      params.update.task_context_ref_2 ?? currentContract?.contextRefs?.[1],
    task_context_ref_3:
      params.update.task_context_ref_3 ?? currentContract?.contextRefs?.[2],
    task_title: params.update.task_title ?? params.current.taskTemplate.title,
    task_worker_prompt: params.update.task_worker_prompt ?? currentSpec.prompt,
    task_goal: params.update.task_goal ?? currentContract?.goal,
    task_in_scope: params.update.task_in_scope ?? currentContract?.scope,
    task_done_when_1:
      params.update.task_done_when_1 ?? currentContract?.acceptance[0],
    task_done_when_2:
      params.update.task_done_when_2 ?? currentContract?.acceptance[1],
    task_done_when_3:
      params.update.task_done_when_3 ?? currentContract?.acceptance[2],
    task_done_when_4:
      params.update.task_done_when_4 ?? currentContract?.acceptance[3],
    task_done_when_5:
      params.update.task_done_when_5 ?? currentContract?.acceptance[4],
    task_out_of_scope:
      params.update.task_out_of_scope ?? currentContract?.outOfScope,
  }
  const taskContractAttrs = toTaskContractAttrs(nextTaskAttrs)
  const contract = buildTaskContractFromAttrs(taskContractAttrs)
  const prompt = resolveWorkerPromptFromAttrs(taskContractAttrs)
  if (!contract || !prompt)
    throw new Error('invalid_plan_effect: enqueue_task contract missing')
  const branch = params.update.task_branch?.trim()
    ? params.update.task_branch.trim()
    : params.current.taskTemplate.branch
  const title = nextTaskAttrs.task_title.trim()
  return buildEnqueueTaskEffect({
    stateDir: params.stateDir,
    focusId: params.focusId,
    title,
    cwd: params.update.task_cwd?.trim() ?? params.current.taskTemplate.cwd,
    prompt,
    contract,
    ...(branch ? { branch } : {}),
  })
}
