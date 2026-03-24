import { buildTaskFingerprint } from '../../work/orchestrator/task-state.js'

import type { TaskPlanEffect } from '../../foundation/types/index.js'

export const buildPlanEffectKey = (params: {
  effect: TaskPlanEffect
  focusId: string
}): string =>
  params.effect.kind === 'enqueue_task'
    ? [
        'enqueue_task',
        buildTaskFingerprint({
          prompt: params.effect.taskTemplate.prompt,
          title: params.effect.taskTemplate.title,
          cwd: params.effect.taskTemplate.cwd,
          profile: 'worker',
          provider: 'codex',
          focusId: params.focusId,
          ...(params.effect.taskTemplate.branch
            ? { branch: params.effect.taskTemplate.branch }
            : {}),
          contract: params.effect.taskTemplate.contract,
        }),
      ].join('\n')
    : `wake_manager\n${params.effect.reason}`
