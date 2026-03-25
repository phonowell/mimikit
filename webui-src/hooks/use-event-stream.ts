import { startTransition, useEffect, useEffectEvent } from 'react'

import { createEventStreamConnection } from '../lib/event-stream-connection.js'

import type { SnapshotEnvelope, TasksSnapshot } from '../types.js'

type Params = {
  onSnapshot: (snapshot: SnapshotEnvelope) => void
  onTasks: (tasks: TasksSnapshot) => void
  onDisconnected: () => void
}

export const useEventStream = ({
  onSnapshot,
  onTasks,
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
  const handleDisconnected = useEffectEvent(() => {
    onDisconnected()
  })

  useEffect(() => {
    const connection = createEventStreamConnection({
      onSnapshot: handleSnapshot,
      onTasks: handleTasks,
      onDisconnected: handleDisconnected,
    })
    return () => connection.stop()
  }, [])
}
