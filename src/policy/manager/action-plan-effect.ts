import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { TaskPlanEffect } from '../../foundation/types/index.js'

export type PlanEffectAttrs = {
  effect_kind?: 'enqueue_task' | 'wake_manager' | undefined
  effect_reason?: string | undefined
  task_title?: string | undefined
  task_worker_prompt?: string | undefined
  task_cwd?: string | undefined
  task_branch?: string | undefined
  task_goal?: string | undefined
  task_in_scope?: string | undefined
  task_done_when_1?: string | undefined
  task_done_when_2?: string | undefined
  task_done_when_3?: string | undefined
  task_done_when_4?: string | undefined
  task_done_when_5?: string | undefined
  task_out_of_scope?: string | undefined
  task_context_ref_1?: string | undefined
  task_context_ref_2?: string | undefined
  task_context_ref_3?: string | undefined
}

const toTaskContractAttrs = (
  params: PlanEffectAttrs,
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

export const buildPlanEffect = (params: PlanEffectAttrs): TaskPlanEffect => {
  if (params.effect_kind === 'wake_manager') {
    return {
      kind: 'wake_manager',
      reason: params.effect_reason as
        | 'scheduled_review'
        | 'capacity_retry'
        | 'follow_up',
    }
  }

  const taskAttrs = toTaskContractAttrs(params)
  const contract = buildTaskContractFromAttrs(taskAttrs)
  const prompt = resolveWorkerPromptFromAttrs(taskAttrs)
  if (!contract || !prompt)
    throw new Error('invalid_plan_effect: enqueue_task contract missing')

  return {
    kind: 'enqueue_task',
    taskTemplate: {
      title: params.task_title?.trim() ?? '',
      prompt,
      cwd: params.task_cwd?.trim() ?? '',
      ...(params.task_branch?.trim()
        ? { branch: params.task_branch.trim() }
        : {}),
      contract,
    },
  }
}

export const resolveUpdatedEffect = (
  current: TaskPlanEffect,
  update: PlanEffectAttrs,
): TaskPlanEffect => {
  const nextKind = update.effect_kind ?? current.kind
  if (nextKind === 'wake_manager') {
    return {
      kind: 'wake_manager',
      reason: (update.effect_reason?.trim() ??
        (current.kind === 'wake_manager' ? current.reason : 'follow_up')) as
        | 'scheduled_review'
        | 'capacity_retry'
        | 'follow_up',
    }
  }

  const nextTaskAttrs = {
    task_context_ref_1:
      update.task_context_ref_1 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.contextRefs?.[0]
        : undefined),
    task_context_ref_2:
      update.task_context_ref_2 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.contextRefs?.[1]
        : undefined),
    task_context_ref_3:
      update.task_context_ref_3 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.contextRefs?.[2]
        : undefined),
    task_title:
      update.task_title ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.title
        : undefined),
    task_worker_prompt:
      update.task_worker_prompt ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.prompt
        : undefined),
    task_goal:
      update.task_goal ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.goal
        : undefined),
    task_in_scope:
      update.task_in_scope ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.scope
        : undefined),
    task_done_when_1:
      update.task_done_when_1 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.acceptance[0]
        : undefined),
    task_done_when_2:
      update.task_done_when_2 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.acceptance[1]
        : undefined),
    task_done_when_3:
      update.task_done_when_3 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.acceptance[2]
        : undefined),
    task_done_when_4:
      update.task_done_when_4 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.acceptance[3]
        : undefined),
    task_done_when_5:
      update.task_done_when_5 ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.acceptance[4]
        : undefined),
    task_out_of_scope:
      update.task_out_of_scope ??
      (current.kind === 'enqueue_task'
        ? current.taskTemplate.contract.outOfScope
        : undefined),
  }
  const taskAttrs = toTaskContractAttrs(nextTaskAttrs)
  const contract = buildTaskContractFromAttrs(taskAttrs)
  const prompt = resolveWorkerPromptFromAttrs(taskAttrs)
  if (!contract || !prompt)
    throw new Error('invalid_plan_effect: enqueue_task contract missing')

  return {
    kind: 'enqueue_task',
    taskTemplate: {
      title: nextTaskAttrs.task_title?.trim() ?? '',
      prompt,
      cwd:
        update.task_cwd?.trim() ??
        (current.kind === 'enqueue_task' ? current.taskTemplate.cwd : ''),
      ...(update.task_branch?.trim()
        ? { branch: update.task_branch.trim() }
        : current.kind === 'enqueue_task' && current.taskTemplate.branch
          ? { branch: current.taskTemplate.branch }
          : {}),
      contract,
    },
  }
}
