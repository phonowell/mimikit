import { stringifyPromptJson } from '../../foundation/prompting/format-base.js'
import { buildPlansPromptPayloadSection } from '../../foundation/prompting/format-plan-content.js'
import { buildTasksPromptPayloadSection } from '../../foundation/prompting/format-task-content.js'
import {
  buildActionFeedbackPromptPayload,
  buildFocusListPromptPayload,
  buildInputsPromptPayload,
  buildWorkingFocusesPromptPayload,
} from '../../foundation/prompting/format.js'

import type { ManagerPromptRuntimeData } from './manager-prompt-runtime-helpers.js'
import type {
  BuildManagerPromptParams,
  OrderedWorkingFocusIds,
  PromptSelectionSummary,
} from './manager-prompt-types.js'
import type { PacketSections } from './select-packet-sections.js'

const buildWorkingFocusIdsPayload = (
  workingFocusIds: OrderedWorkingFocusIds,
): { working_focus_ids?: OrderedWorkingFocusIds } =>
  workingFocusIds.length > 0 ? { working_focus_ids: workingFocusIds } : {}

export const buildStatePacketPayload = (params: {
  selectedSections: PacketSections
  focusPayload: ManagerPromptRuntimeData['focusPayload']
  tasks: BuildManagerPromptParams['tasks']
  workDir: string
  plans: BuildManagerPromptParams['plans']
  workingFocusIds: string[]
  latestResultTaskId?: string
}): {
  payload: string
  selection: PromptSelectionSummary
} => {
  const tasksSection = params.selectedSections.tasks
    ? buildTasksPromptPayloadSection(params.tasks, [], params.workDir, {
        workingFocusIds: params.workingFocusIds,
        ...(params.latestResultTaskId
          ? { latestResultTaskId: params.latestResultTaskId }
          : {}),
      })
    : {
        payload: undefined,
        selection: { selected: 0, full: 0, card: 0 },
      }
  const plansSection = params.selectedSections.plans
    ? buildPlansPromptPayloadSection(params.plans ?? [], {
        workingFocusIds: params.workingFocusIds,
        ...(params.latestResultTaskId
          ? { latestResultTaskId: params.latestResultTaskId }
          : {}),
      })
    : {
        payload: undefined,
        selection: { selected: 0, full: 0, card: 0 },
      }

  return {
    payload: stringifyPromptJson({
      ...buildWorkingFocusIdsPayload(params.workingFocusIds),
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
      ...(params.selectedSections.tasks ? { tasks: tasksSection.payload } : {}),
      ...(params.selectedSections.plans ? { plans: plansSection.payload } : {}),
    }),
    selection: {
      tasks: tasksSection.selection,
      plans: plansSection.selection,
    },
  }
}

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
