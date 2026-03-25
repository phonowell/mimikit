import type { FocusId, ISODate } from '../../foundation/types/base.js'

export type UserChoiceOption = {
  id: string
  label: string
  reason: string
}

export type PendingUserChoiceEffect = {
  type: 'resume_task'
  taskId: string
  optionId: string
  reason?: string | undefined
}

export type PendingUserChoice = {
  id: string
  question: string
  options: UserChoiceOption[]
  defaultOptionId: string
  createdAt: ISODate
  expiresAt?: ISODate | undefined
  focusId: FocusId
  effect?: PendingUserChoiceEffect | undefined
}
