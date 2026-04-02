import { applyAssignFocusAction } from './action-apply-focus.js'
import { applyRememberMemoryAction } from './action-apply-memory.js'
import { applyRememberProjectProfileAction } from './action-apply-project-profile.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import { validateAssignFocusAction } from './action-validation-assign-focus.js'
import {
  validateRememberMemory,
  validateRememberProjectProfile,
} from './action-validation.js'

export const DIALOG_ACTION_DEFINITIONS = [] satisfies ManagerActionDefinition[]

export const FOCUS_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'assign_focus',
      domain: 'focus',
      prompt: ACTION_PROMPT_SPECS.assign_focus,
    },
    (item, context) => validateAssignFocusAction(item, context),
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
  createContinueAction(
    {
      name: 'remember_project_profile',
      domain: 'memory',
      prompt: ACTION_PROMPT_SPECS.remember_project_profile,
    },
    (item, context) => validateRememberProjectProfile(item, context),
    applyRememberProjectProfileAction,
  ),
] satisfies ManagerActionDefinition[]
