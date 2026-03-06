import type { UserInput } from '../types/index.js'

export const isWorkerSlotsIdleSystemInput = (input: UserInput): boolean =>
  input.role === 'system' && input.text.includes('name="worker_slots_idle"')

export const hasNonSlotIdleManagerInput = (inputs: UserInput[]): boolean =>
  inputs.some(
    (input) => input.role !== 'system' || !isWorkerSlotsIdleSystemInput(input),
  )
