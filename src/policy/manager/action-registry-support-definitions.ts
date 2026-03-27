import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { applyAssignFocusAction } from './action-apply-focus.js'
import { applyRememberMemoryAction } from './action-apply-memory.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  createStopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateAskUserChoice,
  validateRememberMemory,
  validateWithSchema,
} from './action-validation.js'
import { assignFocusActionSchema } from './manager-turn-schema.js'

export const DIALOG_ACTION_DEFINITIONS = [
  createStopAction(
    {
      name: 'ask_user_choice',
      domain: 'dialog',
      prompt: ACTION_PROMPT_SPECS.ask_user_choice,
    },
    (item, context) => validateAskUserChoice(item, context),
    (runtime, item) => applyAskUserChoiceAction(runtime, item),
  ),
] satisfies ManagerActionDefinition[]

export const FOCUS_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'assign_focus',
      domain: 'focus',
      prompt: ACTION_PROMPT_SPECS.assign_focus,
    },
    (item) => validateWithSchema(item, assignFocusActionSchema),
    applyAssignFocusAction,
  ),
] satisfies ManagerActionDefinition[]

export const MEMORY_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'remember_memory',
      domain: 'memory',
      prompt: ACTION_PROMPT_SPECS.remember_memory,
    },
    (item, context) => validateRememberMemory(item, context),
    applyRememberMemoryAction,
  ),
] satisfies ManagerActionDefinition[]
