import type { RuntimeState } from './runtime.js'
import type { TaskResult } from '../types/index.js'

export type ManagerBuffer = {
  inputs: RuntimeState['pendingInputs']
  results: TaskResult[]
  lastInputAt: number
  firstResultAt: number
}

export const createManagerBuffer = (): ManagerBuffer => ({
  inputs: [],
  results: [],
  lastInputAt: 0,
  firstResultAt: 0,
})

export const clearManagerBuffer = (buffer: ManagerBuffer): void => {
  buffer.inputs = []
  buffer.results = []
  buffer.lastInputAt = 0
  buffer.firstResultAt = 0
}

export const syncManagerPendingInputs = (
  runtime: RuntimeState,
  buffer: ManagerBuffer,
): void => {
  runtime.managerPendingInputs = [...buffer.inputs]
}
