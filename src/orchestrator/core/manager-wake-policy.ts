import type { WorkerProfile } from '../../types/index.js'

export const shouldWakeManagerForTaskTerminalEvent = (
  profile: WorkerProfile | undefined,
): boolean => profile === 'manager'

export const shouldWakeManagerForCronTrigger = (
  managerTriggeredCount: number,
): boolean => managerTriggeredCount > 0
