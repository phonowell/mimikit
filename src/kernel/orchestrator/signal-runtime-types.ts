import type { RuntimeState, UiWakeKind } from './runtime-state.js'

export type LoopWakeOptions = {
  notifyUi?: boolean
  uiKind?: UiWakeKind
}

export type UiSignalRuntime = {
  process: {
    ui: Pick<
      RuntimeState['process']['ui'],
      'wakeVersion' | 'wakeEvents' | 'signalControllers'
    >
  }
}

export type ManagerSignalRuntime = {
  process: {
    manager: Pick<
      RuntimeState['process']['manager'],
      'wakePending' | 'signalController'
    >
    ui: UiSignalRuntime['process']['ui']
  }
}

export type ManagerWaitRuntime = {
  process: {
    manager: Pick<
      RuntimeState['process']['manager'],
      'wakePending' | 'signalController'
    >
  }
}

export type WorkerSignalRuntime = {
  process: {
    worker: Pick<RuntimeState['process']['worker'], 'signalController'>
    ui: UiSignalRuntime['process']['ui']
  }
}

export type WorkerWaitRuntime = {
  process: {
    worker: Pick<RuntimeState['process']['worker'], 'signalController'>
  }
}
