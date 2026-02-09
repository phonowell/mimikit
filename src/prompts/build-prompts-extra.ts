import { joinPromptSections, renderPromptTemplate } from './format.js'
import { loadPromptFile } from './prompt-loader.js'

export const buildWorkerStandardPlannerPrompt = async (params: {
  workDir: string
  taskPrompt: string
  transcript: string[]
  actions: string[]
  checkpointRecovered: boolean
}): Promise<string> => {
  const system = await loadPromptFile(
    params.workDir,
    'worker-standard',
    'planner-system',
  )
  const injectionTemplate = await loadPromptFile(
    params.workDir,
    'worker-standard',
    'planner-injection',
  )
  const transcript =
    params.transcript.length > 0 ? params.transcript.join('\n\n') : '(empty)'
  const injectionValues = Object.fromEntries<string>([
    ['checkpoint_recovered', params.checkpointRecovered ? 'true' : 'false'],
    ['task_prompt', params.taskPrompt],
    ['available_actions', params.actions.join(', ')],
    ['transcript', transcript],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
