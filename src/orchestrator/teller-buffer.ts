import type { RuntimeState } from './runtime-state.js'
import type { TaskResult } from '../types/index.js'

export type TellerBuffer = {
  inputs: RuntimeState['inflightInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
}

export const createTellerBuffer = (): TellerBuffer => ({
  inputs: [],
  results: [],
  lastInputAt: 0,
  firstResultAt: 0,
})

export const clearTellerBuffer = (buffer: TellerBuffer): void => {
  buffer.inputs = []
  buffer.results = []
  buffer.lastInputAt = 0
  buffer.firstResultAt = 0
}
