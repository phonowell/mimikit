import { resolve } from 'node:path'

import { prepareWorkerTaskPrompt } from './build-worker-task-prompt.js'
import { escapeCdata } from './format-base.js'
import {
  formatTaskFocusBrief,
  type TaskFocusBrief,
} from './format-task-focus-brief.js'
import { formatEnvironment, renderPromptTemplate } from './format.js'
import { loadPromptSource } from './prompt-loader.js'

import type { Task } from '../types/index.js'

export const buildWorkerPrompt = async (params: {
  stateDir: string
  workspaceDir: string
  task: Task
  focusBrief?: TaskFocusBrief
}): Promise<string> => {
  const systemSource = await loadPromptSource('worker/system.md')
  const taskPrompt = await prepareWorkerTaskPrompt({
    workDir: params.stateDir,
    taskId: params.task.id,
    taskCreatedAt: params.task.createdAt,
    taskPrompt: params.task.prompt,
  })
  const focusBrief = formatTaskFocusBrief(params.focusBrief)
  return renderPromptTemplate(
    systemSource.template,
    {
      environment: escapeCdata(
        formatEnvironment({
          stateDir: params.stateDir,
          workDir: params.workspaceDir,
          generatedDir: resolve(params.stateDir, 'generated'),
        }),
      ),
      prompt: escapeCdata(taskPrompt),
      focus_brief: focusBrief ? escapeCdata(focusBrief) : '',
    },
    systemSource.path,
  )
}
