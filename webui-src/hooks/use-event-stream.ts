import { startTransition, useEffect, useEffectEvent } from 'react'

import { createEventStreamConnection } from '../lib/event-stream-connection.js'

import type {
  PlansSnapshot,
  SnapshotEnvelope,
  TasksSnapshot,
} from '../types.js'

type Params = {
  onSnapshot: (snapshot: SnapshotEnvelope) => void
  onTasks: (tasks: TasksSnapshot) => void
  onPlans: (plans: PlansSnapshot) => void
  onDisconnected: () => void
}

export const useEventStream = ({
  onSnapshot,
  onTasks,
  onPlans,
  onDisconnected,
}: Params): void => {
  const handleSnapshot = useEffectEvent((snapshot: SnapshotEnvelope) => {
    startTransition(() => {
      onSnapshot(snapshot)
    })
  })
  const handleTasks = useEffectEvent((tasks: TasksSnapshot) => {
    startTransition(() => {
      onTasks(tasks)
    })
  })
  const handlePlans = useEffectEvent((plans: PlansSnapshot) => {
    startTransition(() => {
      onPlans(plans)
    })
  })
  const handleDisconnected = useEffectEvent(() => {
    onDisconnected()
  })

  useEffect(() => {
    const connection = createEventStreamConnection({
      onSnapshot: handleSnapshot,
      onTasks: handleTasks,
      onPlans: handlePlans,
      onDisconnected: handleDisconnected,
    })
    return () => connection.stop()
  }, [])
}
