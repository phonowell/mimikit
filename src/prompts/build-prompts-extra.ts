import { joinPromptSections, renderPromptTemplate } from './format.js'
import { loadPromptFile } from './prompt-loader.js'

export const buildWorkerStandardPlannerPrompt = async (params: {
  workDir: string
  taskPrompt: string
  transcript: string[]
  tools: string[]
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
    ['available_tools', params.tools.join(', ')],
    ['transcript', transcript],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildIdleReviewPrompt = async (params: {
  workDir: string
  historyTexts: string[]
}): Promise<string> => {
  const system = await loadPromptFile(
    params.workDir,
    'thinker',
    'idle-review-system',
  )
  const injectionTemplate = await loadPromptFile(
    params.workDir,
    'thinker',
    'idle-review-injection',
  )
  const historySnippets =
    params.historyTexts.length > 0
      ? params.historyTexts
          .map((line, index) => `${index + 1}. ${line}`)
          .join('\n')
      : '(empty)'
  const injection = renderPromptTemplate(injectionTemplate, {
    history_snippets: historySnippets,
  })
  return joinPromptSections([system, injection])
}

export const buildCodeEvolveTaskPrompt = async (params: {
  workDir: string
  feedbackMessages: string[]
}): Promise<string> => {
  const template = await loadPromptFile(
    params.workDir,
    'worker-expert',
    'code-evolve-task',
  )
  const feedbackList =
    params.feedbackMessages.length > 0
      ? params.feedbackMessages
          .slice(0, 20)
          .map((item, index) => `${index + 1}. ${item}`)
          .join('\n')
      : '(empty)'
  return renderPromptTemplate(template, { feedback_list: feedbackList })
}

export const buildPromptOptimizerPrompt = async (params: {
  workDir: string
  source: string
}): Promise<string> => {
  const template = await loadPromptFile(
    params.workDir,
    'thinker',
    'prompt-optimizer',
  )
  return renderPromptTemplate(template, {
    source_prompt: params.source,
  })
}
