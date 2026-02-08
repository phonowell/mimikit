import { runApiRunner } from '../llm/api-runner.js'
import { buildWorkerStandardPlannerPrompt } from '../prompts/build-prompts.js'
import { parseCommandAttrs } from '../shared/command-attrs.js'
import {
  loadTaskCheckpoint,
  saveTaskCheckpoint,
} from '../storage/task-checkpoint.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { listWorkerTools, runWorkerTool } from './tools/registry.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const TOOL_ACTIONS = [
  'read',
  'write',
  'edit',
  'apply_patch',
  'exec',
  'browser',
] as const

type StandardToolAction = (typeof TOOL_ACTIONS)[number]

type StandardStep = {
  action: 'respond' | 'tool'
  response?: string
  tool?: {
    name: StandardToolAction
    args: Record<string, unknown>
  }
}

type StandardState = {
  round: number
  transcript: string[]
  finalized: boolean
  finalOutput: string
}

type ToolExecutionRecord = {
  round: number
  tool: string
  ok: boolean
  output: string
  error?: string
}

const initialState = (): StandardState => ({
  round: 0,
  transcript: [],
  finalized: false,
  finalOutput: '',
})

const normalizeState = (raw: unknown): StandardState => {
  if (!raw || typeof raw !== 'object') return initialState()
  const record = raw as Partial<StandardState>
  return {
    round:
      typeof record.round === 'number' && record.round >= 0
        ? Math.floor(record.round)
        : 0,
    transcript: Array.isArray(record.transcript)
      ? record.transcript.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    finalized: record.finalized === true,
    finalOutput:
      typeof record.finalOutput === 'string' ? record.finalOutput : '',
  }
}

const parseStep = (output: string): StandardStep => {
  const raw = output.trim()
  if (!raw) throw new Error('standard_step_empty')

  const parseBoolean = (value: string | undefined): boolean | undefined => {
    if (value === undefined) return undefined
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error('standard_tool_boolean_invalid')
  }

  const requireAttr = (attrs: Record<string, string>, key: string): string => {
    const value = attrs[key]
    if (value === undefined || value.trim().length === 0)
      throw new Error(`standard_tool_attr_missing:${key}`)
    return value
  }

  const asToolAction = (action: string): StandardToolAction | undefined =>
    TOOL_ACTIONS.find((item) => item === action)

  const buildToolArgs = (
    action: StandardToolAction,
    attrs: Record<string, string>,
  ): Record<string, unknown> => {
    if (action === 'read') return { path: requireAttr(attrs, 'path') }

    if (action === 'write') {
      return {
        path: requireAttr(attrs, 'path'),
        content: requireAttr(attrs, 'content'),
      }
    }
    if (action === 'edit') {
      const replaceAll = parseBoolean(attrs.replaceAll)
      return {
        path: requireAttr(attrs, 'path'),
        oldText: requireAttr(attrs, 'oldText'),
        newText: requireAttr(attrs, 'newText'),
        ...(replaceAll === undefined ? {} : { replaceAll }),
      }
    }
    if (action === 'apply_patch') return { input: requireAttr(attrs, 'input') }

    if (action === 'exec') return { command: requireAttr(attrs, 'command') }

    return { command: requireAttr(attrs, 'command') }
  }

  const parseAtStep = (text: string): StandardStep | null => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@'))
    if (lines.length === 0) return null
    const line = lines[lines.length - 1] ?? ''
    const commandMatch = line.match(/^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/)
    if (!commandMatch) return null
    const action = (commandMatch[1] ?? '').trim()
    const attrs = parseCommandAttrs(commandMatch[2]?.trim() ?? '')

    if (action === 'respond') {
      const response = (attrs.response ?? '').trim()
      if (!response) throw new Error('standard_response_empty')
      return {
        action: 'respond',
        response,
      }
    }

    const toolName = asToolAction(action)
    if (!toolName) throw new Error(`standard_step_unknown_command:${action}`)

    return {
      action: 'tool',
      tool: {
        name: toolName,
        args: buildToolArgs(toolName, attrs),
      },
    }
  }

  const direct = parseAtStep(raw)
  if (direct) return direct

  const commandBlockMatch = raw.match(
    /<MIMIKIT:commands\s*>([\s\S]*?)<\/MIMIKIT:commands>/,
  )
  if (commandBlockMatch) {
    const block = parseAtStep(commandBlockMatch[1] ?? '')
    if (block) return block
  }

  throw new Error('standard_step_parse_failed:missing_valid_command')
}

const summarizeToolCall = (params: {
  name: string
  args: unknown
  output: string
  ok: boolean
  error?: string
}): string =>
  [
    `tool: ${params.name}`,
    `ok: ${params.ok}`,
    `args: ${JSON.stringify(params.args ?? {})}`,
    ...(params.error ? [`error: ${params.error}`] : []),
    `output:\n${params.output}`,
  ].join('\n')

const buildToolExecutionPayload = (
  record: ToolExecutionRecord,
): Record<string, unknown> => ({
  round: record.round,
  tool: record.tool,
  ok: record.ok,
  ...(record.error ? { error: record.error } : {}),
})

export const runStandardWorker = async (params: {
  stateDir: string
  workDir: string
  taskId: string
  prompt: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const startedAt = Date.now()
  const maxRounds = Math.max(
    1,
    Math.floor(Math.max(1, params.timeoutMs) / 1_000),
  )
  const tools = listWorkerTools()
  const recovered = await loadTaskCheckpoint(params.stateDir, params.taskId)
  const state = normalizeState(recovered?.state)
  const checkpointRecovered = Boolean(recovered)
  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: checkpointRecovered ? 'standard_resume' : 'standard_start',
    payload: {
      round: state.round,
      tools,
    },
  })

  let usageInput = 0
  let usageOutput = 0

  while (!state.finalized) {
    if (params.abortSignal?.aborted) throw new Error('standard_aborted')
    if (Date.now() - startedAt > params.timeoutMs)
      throw new Error('standard_timeout')
    if (state.round >= maxRounds)
      throw new Error('standard_max_rounds_exceeded')
    const plannerPrompt = await buildWorkerStandardPlannerPrompt({
      workDir: params.workDir,
      taskPrompt: params.prompt,
      transcript: state.transcript,
      tools,
      checkpointRecovered,
    })
    const planner = await runApiRunner({
      prompt: plannerPrompt,
      timeoutMs: Math.max(5_000, Math.min(30_000, params.timeoutMs)),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    usageInput += planner.usage?.input ?? 0
    usageOutput += planner.usage?.output ?? 0
    const step = parseStep(planner.output)
    state.round += 1
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.taskId,
      type: 'standard_round',
      payload: {
        round: state.round,
        action: step.action,
      },
    })

    if (step.action === 'respond') {
      const response =
        typeof step.response === 'string' ? step.response.trim() : ''
      if (!response) throw new Error('standard_response_empty')
      state.finalized = true
      state.finalOutput = response
      state.transcript.push(
        [`round: ${state.round}`, `final_response:\n${response}`].join('\n'),
      )
      await saveTaskCheckpoint({
        stateDir: params.stateDir,
        checkpoint: {
          taskId: params.taskId,
          stage: 'responded',
          updatedAt: new Date().toISOString(),
          state,
        },
      })
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.taskId,
        type: 'standard_done',
        payload: {
          round: state.round,
        },
      })
      break
    }

    const toolName = step.tool?.name.trim() ?? ''
    if (!toolName) throw new Error('standard_tool_name_missing')
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.taskId,
      type: 'tool_call_start',
      payload: {
        round: state.round,
        tool: toolName,
        args: step.tool?.args ?? {},
      },
    })
    const toolResult = await runWorkerTool(
      { workDir: params.workDir },
      toolName,
      step.tool?.args ?? {},
    )
    const toolOutput =
      toolResult.output.length > 20_000
        ? `${toolResult.output.slice(0, 20_000)}\n...[truncated]`
        : toolResult.output
    const record: ToolExecutionRecord = {
      round: state.round,
      tool: toolName,
      ok: toolResult.ok,
      output: toolOutput,
      ...(toolResult.error ? { error: toolResult.error } : {}),
    }
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.taskId,
      type: 'tool_call_end',
      payload: {
        round: state.round,
        tool: toolName,
        ok: toolResult.ok,
        ...(toolResult.error ? { error: toolResult.error } : {}),
        record: buildToolExecutionPayload(record),
      },
    })
    state.transcript.push(
      summarizeToolCall({
        name: toolName,
        args: step.tool?.args ?? {},
        output: toolOutput,
        ok: toolResult.ok,
        ...(toolResult.error ? { error: toolResult.error } : {}),
      }),
    )
    await saveTaskCheckpoint({
      stateDir: params.stateDir,
      checkpoint: {
        taskId: params.taskId,
        stage: 'running',
        updatedAt: new Date().toISOString(),
        state,
      },
    })
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const total = usageInput + usageOutput
  return {
    output: state.finalOutput,
    elapsedMs,
    ...(total > 0
      ? {
          usage: {
            input: usageInput,
            output: usageOutput,
            total,
          },
        }
      : {}),
  }
}
