import { useEffect, useEffectEvent, useRef } from 'react'

import { applyIncomingSnapshot, findNewAgentMessages } from '../lib/messages.js'

import { useBranding } from './use-branding.js'
import { useEventStream } from './use-event-stream.js'

import type { AppState, SnapshotEnvelope, TasksSnapshot } from '../types.js'
import type { Dispatch, SetStateAction } from 'react'

const TOAST_HIDE_DELAY_MS = 2_800

type ScrollController = {
  captureLayoutShift: () => void
}

const collectMessageIds = (
  messages: ReadonlyArray<AppState['messages'][number]>,
): ReadonlySet<string> => {
  const ids = new Set<string>()
  for (const message of messages) {
    const id = typeof message.id === 'string' ? message.id.trim() : ''
    if (id) ids.add(id)
  }
  return ids
}

type Params = {
  appState: AppState
  scroll: ScrollController
  speakMessages: (messages: AppState['messages']) => void
  setAppState: Dispatch<SetStateAction<AppState>>
  setOpenPlanMenuId: Dispatch<SetStateAction<string>>
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
  setOpenPlanMenuId,
  setOpenTaskMenuId,
  setStatusOverride,
  setToast,
  setToolsMenuOpen,
  toast,
}: Params): void => {
  const previousMessageIdsRef = useRef(collectMessageIds(appState.messages))
  const handleSnapshot = useEffectEvent((snapshot: SnapshotEnvelope) => {
    scroll.captureLayoutShift()
    setStatusOverride(null)
    setAppState((current) => applyIncomingSnapshot(current, snapshot).next)
  })
  const handleTasks = useEffectEvent((tasks: TasksSnapshot) =>
    setAppState((current) => ({ ...current, tasks: tasks.tasks })),
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

  useBranding(appState.status, appState.focuses)
  useEventStream({
    onSnapshot: handleSnapshot,
    onTasks: handleTasks,
    onDisconnected: handleDisconnected,
  })

  useEffect(() => {
    const previousIds = previousMessageIdsRef.current
    const newAgentMessages = findNewAgentMessages(
      appState.messages,
      previousIds,
    )
    previousMessageIdsRef.current = collectMessageIds(appState.messages)
    if (newAgentMessages.length > 0) speakMessages(newAgentMessages)
  }, [appState.messages, speakMessages])

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
