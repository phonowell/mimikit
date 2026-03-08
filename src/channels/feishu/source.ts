import { hasUserInputFromSource } from '../shared/passive-reply.js'
import { isNoChoiceReturnChannelSource } from '../shared/source.js'

import type { UserInput } from '../../types.js'

export const hasNoChoiceReturnChannelInput = (inputs: UserInput[]): boolean =>
  hasUserInputFromSource(inputs, 'telegram') ||
  hasUserInputFromSource(inputs, 'feishu')

export { isNoChoiceReturnChannelSource }
