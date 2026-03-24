import { resolve } from 'node:path'

import { escapeCdata } from '../../foundation/prompting/format-base.js'
import {
  formatTaskFocusBrief,
  type TaskFocusBrief,
} from '../../foundation/prompting/format-task-focus-brief.js'
import {
  formatEnvironment,
  renderPromptTemplate,
} from '../../foundation/prompting/format.js'
import { loadPromptSource } from '../../foundation/prompting/prompt-loader.js'

import { prepareWorkerTaskPrompt } from './build-worker-task-prompt.js'

import type { Task } from '../../foundation/types/index.js'

export const buildWorkerPrompt = async (params: {
  stateDir: string
  workspaceDir: string
  task: Task
  focusBrief?: TaskFocusBrief
  resumeInstruction?: string
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
      resume_instruction: params.resumeInstruction
        ? escapeCdata(params.resumeInstruction)
        : '',
    },
    systemSource.path,
  )
}
