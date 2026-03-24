import { stringifyPromptJson } from '../../foundation/prompting/format-base.js'
import {
  buildActionFeedbackPromptPayload,
  buildFocusListPromptPayload,
  buildInputsPromptPayload,
  buildPlansPromptPayload,
  buildTasksPromptPayload,
  buildWorkingFocusesPromptPayload,
} from '../../foundation/prompting/format.js'

import type { ManagerPromptRuntimeData } from './manager-prompt-runtime-helpers.js'
import type { BuildManagerPromptParams } from './manager-prompt-types.js'
import type { PacketSections } from './select-packet-sections.js'

export const buildStatePacketPayload = (params: {
  selectedSections: PacketSections
  focusPayload: ManagerPromptRuntimeData['focusPayload']
  tasks: BuildManagerPromptParams['tasks']
  workDir: string
  plans: BuildManagerPromptParams['plans']
}): string =>
  stringifyPromptJson({
    ...(params.selectedSections.focus_list
      ? {
          focus_list: buildFocusListPromptPayload(
            params.focusPayload.focusList,
          ),
        }
      : {}),
    ...(params.selectedSections.working_focuses
      ? {
          working_focuses: buildWorkingFocusesPromptPayload(
            params.focusPayload.workingFocuses,
          ),
        }
      : {}),
    ...(params.selectedSections.tasks
      ? {
          tasks: buildTasksPromptPayload(params.tasks, [], params.workDir),
        }
      : {}),
    ...(params.selectedSections.plans
      ? { plans: buildPlansPromptPayload(params.plans ?? []) }
      : {}),
  })

export const buildEventPacketPayload = (params: {
  selectedSections: PacketSections
  environmentSource: string
  inputs: BuildManagerPromptParams['inputs']
  quoteLookup: ManagerPromptRuntimeData['quoteLookup']
  batchResultsPayload: unknown
  recentHistoryPayload: unknown
  actionFeedback: BuildManagerPromptParams['actionFeedback']
  packet: unknown
}): string =>
  stringifyPromptJson({
    ...(params.selectedSections.environment
      ? { environment: params.environmentSource }
      : {}),
    ...(params.selectedSections.inputs
      ? { inputs: buildInputsPromptPayload(params.inputs, params.quoteLookup) }
      : {}),
    ...(params.selectedSections.batch_results
      ? { batch_results: params.batchResultsPayload }
      : {}),
    ...(params.selectedSections.recent_history
      ? { recent_history: params.recentHistoryPayload }
      : {}),
    ...(params.selectedSections.action_feedback
      ? {
          action_feedback: buildActionFeedbackPromptPayload(
            params.actionFeedback ?? [],
          ),
        }
      : {}),
    packet: params.packet,
  })
