import { useEffect, useEffectEvent } from 'react'

import { applyIncomingSnapshot } from '../lib/messages.js'

import { useBranding } from './use-branding.js'
import { useEventStream } from './use-event-stream.js'

import type { AppState, SnapshotEnvelope, TasksSnapshot } from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

const TOAST_HIDE_DELAY_MS = 2_800

type ScrollController = {
  captureLayoutShift: () => void
}

type Params = {
  appState: AppState
  scroll: ScrollController
  speakMessages: (messages: AppState['messages']) => void
  setAppState: Dispatch<SetStateAction<AppState>>
  setDisconnected: Dispatch<SetStateAction<boolean>>
  setOpenTaskMenuId: Dispatch<SetStateAction<string>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setToast: Dispatch<
    SetStateAction<{ message: string; state: '' | 'success' | 'error' } | null>
  >
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
  toast: { message: string; state: '' | 'success' | 'error' } | null
}

export const useAppRuntimeEffects = ({
  appState,
  scroll,
  speakMessages,
  setAppState,
  setDisconnected,
  setOpenTaskMenuId,
  setStatusOverride,
  setToast,
  setToolsMenuOpen,
  toast,
}: Params): void => {
  const handleSnapshot = useEffectEvent((snapshot: SnapshotEnvelope) => {
    scroll.captureLayoutShift()
    setDisconnected(false)
    setStatusOverride(null)
    setAppState((current) => {
      const { next, newAgentMessages } = applyIncomingSnapshot(
        current,
        snapshot,
      )
      if (newAgentMessages.length > 0) speakMessages(newAgentMessages)
      return next
    })
  })
  const handleTasks = useEffectEvent((tasks: TasksSnapshot) =>
    setAppState((current) => ({ ...current, tasks: tasks.tasks })),
  )
  const handleDisconnected = useEffectEvent(() => {
    setDisconnected(true)
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
    if (!target.closest('[data-task-actions="true"]')) setOpenTaskMenuId('')
  })

  useBranding(appState.status, appState.focuses)
  useEventStream({
    onSnapshot: handleSnapshot,
    onTasks: handleTasks,
    onDisconnected: handleDisconnected,
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_HIDE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [setToast, toast])

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])
}
