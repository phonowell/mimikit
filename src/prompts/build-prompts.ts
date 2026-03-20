import {
  formatManagerActionSurfacePrompt,
  resolveManagerActionSurfacePromptConfig,
} from '../manager/action-surface-prompt.js'

import { renderPromptTemplate } from './format.js'
import { buildManagerPromptPackets } from './manager-prompt-packet-build.js'
import { prepareManagerPromptRuntimeData } from './manager-prompt-runtime-data.js'
import { loadPromptSource } from './prompt-loader.js'

import type {
  BuildManagerPromptParams,
  ManagerPromptPayload,
} from './manager-prompt-types.js'
import type { ProviderPromptSegment } from '../providers/types.js'

export type { ManagerEnv } from '../types/index.js'
export type {
  BuildManagerPromptParams,
  ManagerPromptPayload,
  PromptSectionLimits,
} from './manager-prompt-types.js'
export { buildWorkerPrompt } from './build-worker-prompt.js'

const CONTEXT_EMPTY_VALUES: Record<string, string> = {
  action_surface: '',
  state_packet: '',
  event_packet: '',
  remembered_memory: '',
  memory: '',
}

export const buildManagerPromptPayload = async (
  params: BuildManagerPromptParams,
): Promise<ManagerPromptPayload> => {
  const runtime = await prepareManagerPromptRuntimeData(params)
  const systemSource = await loadPromptSource('manager/system.md')
  const contextSource = await loadPromptSource('manager/context.md')
  const wakeProfile = params.wakeProfile ?? params.env?.wakeProfile ?? 'mixed'
  const packetMode = params.packetMode ?? 'standard'
  const actionSurface = formatManagerActionSurfacePrompt(
    resolveManagerActionSurfacePromptConfig({
      wakeProfile,
      packetMode,
      ...(params.actionFeedback
        ? { actionFeedback: params.actionFeedback }
        : {}),
    }),
  )
  const packets = buildManagerPromptPackets({
    workDir: params.workDir,
    wakeProfile,
    packetMode,
    limits: params.promptSectionLimits,
    runtime,
    inputs: params.inputs,
    tasks: params.tasks,
    plans: params.plans,
    historyLookup: params.historyLookup,
    queryLookup: params.queryLookup,
    readFileLookup: params.readFileLookup,
    actionFeedback: params.actionFeedback,
    workingFocusIds: params.workingFocusIds,
    env: params.env,
  })

  const prefix = renderPromptTemplate(
    systemSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      action_surface: actionSurface,
    },
    systemSource.path,
  ).trim()
  const stableContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      state_packet: packets.statePacket,
      remembered_memory: packets.selectedRememberedMemory,
    },
    contextSource.path,
  ).trim()
  const volatileContext = renderPromptTemplate(
    contextSource.template,
    {
      ...CONTEXT_EMPTY_VALUES,
      event_packet: packets.eventPacket,
      memory: packets.selectedMemory,
    },
    contextSource.path,
  ).trim()
  const suffix = [stableContext, volatileContext]
    .filter((segment) => segment.length > 0)
    .join('\n\n')
    .trim()
  const promptSegments: ProviderPromptSegment[] = [
    { text: prefix },
    { text: stableContext },
    { text: volatileContext, cacheControl: 'ephemeral' as const },
  ].filter(
    (segment): segment is ProviderPromptSegment =>
      segment.text.trim().length > 0,
  )
  if (promptSegments.length === 1) promptSegments.push({ text: suffix })

  return {
    prefix,
    suffix,
    contextPacket: packets.packetBundle.packet,
    packetSummary: packets.packetBundle.summaryText,
    prompt: [prefix, stableContext, volatileContext]
      .filter((segment) => segment.length > 0)
      .join('\n\n')
      .trim(),
    promptSegments,
  }
}

export const buildManagerPrompt = async (
  params: BuildManagerPromptParams,
): Promise<string> => (await buildManagerPromptPayload(params)).prompt
