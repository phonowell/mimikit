import type { UserInput } from '../types/index.js'

export const isIdleSystemInput = (input: UserInput): boolean =>
  input.role === 'system' && input.text.includes('name="idle"')

export const hasNonIdleManagerInput = (inputs: UserInput[]): boolean =>
  inputs.some((input) => input.role !== 'system' || !isIdleSystemInput(input))
