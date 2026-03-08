import type { UserInput } from '../../types.js'

type UserSourceInput = Extract<UserInput, { role: 'user' }> & {
  source: string
}

export const isUserInputFromSource = (
  input: UserInput,
  source: string,
): input is UserSourceInput => input.role === 'user' && input.source === source

export const hasUserInputFromSource = (
  inputs: UserInput[],
  source: string,
): boolean => inputs.some((input) => isUserInputFromSource(input, source))

export const resolveLatestUserInputFromSource = (
  inputs: UserInput[],
  source: string,
): UserSourceInput | undefined => {
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index]
    if (input && isUserInputFromSource(input, source)) return input
  }
  return undefined
}
