import { useEffect, useEffectEvent } from 'react'

import {
  applyIncomingPlans,
  applyIncomingSnapshot,
  applyIncomingTasks,
} from '../lib/messages.js'

import { useBranding } from './use-branding.js'
import { useEventStream } from './use-event-stream.js'

import type {
  AppState,
  ConfirmDialogState,
  PlansSnapshot,
  SnapshotEnvelope,
  TasksSnapshot,
} from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

type ScrollController = {
  captureLayoutShift: () => void
}

type Params = {
  appState: AppState
  confirmDialog: ConfirmDialogState | null
  plansOpen: boolean
  scroll: ScrollController
  setAppState: Dispatch<SetStateAction<AppState>>
  setOpenPlanMenuId: Dispatch<SetStateAction<string>>
  setOpenTaskMenuId: Dispatch<SetStateAction<string>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
  tasksOpen: boolean
}

export const useAppRuntimeEffects = ({
  appState,
  confirmDialog,
  plansOpen,
  scroll,
  setAppState,
  setOpenPlanMenuId,
  setOpenTaskMenuId,
  setStatusOverride,
  setToolsMenuOpen,
  tasksOpen,
}: Params): void => {
  const handleSnapshot = useEffectEvent((snapshot: SnapshotEnvelope) => {
    scroll.captureLayoutShift()
    setStatusOverride(null)
    setAppState((current) => applyIncomingSnapshot(current, snapshot).next)
  })
  const handleTasks = useEffectEvent((tasks: TasksSnapshot) =>
    setAppState((current) => applyIncomingTasks(current, tasks)),
  )
  const handlePlans = useEffectEvent((plans: PlansSnapshot) =>
    setAppState((current) => applyIncomingPlans(current, plans)),
  )
  const handleDisconnected = useEffectEvent(() => {
    setAppState((current) => ({
      ...current,
      awaitingReply: false,
      status: { ...current.status, agentStatus: 'disconnected' },
    }))
  })
  const handleDocumentClick = useEffectEvent((event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('.tools-menu-wrap')) setToolsMenuOpen(false)
    if (!target.closest('[data-plan-actions="true"]')) setOpenPlanMenuId('')
    if (!target.closest('[data-task-actions="true"]')) setOpenTaskMenuId('')
  })

  useBranding(appState.status, {
    confirmDialog,
    plansOpen,
    tasks: appState.tasks,
    tasksOpen,
  })
  useEventStream({
    onSnapshot: handleSnapshot,
    onTasks: handleTasks,
    onPlans: handlePlans,
    onDisconnected: handleDisconnected,
  })

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])
}
