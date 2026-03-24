import { useEffect, useState } from 'react'

import { formatStatusText } from '../../webui/status.js'
import { appendClientError } from '../lib/client-error.js'
import { createControllerActions } from '../lib/controller-actions.js'
import { resolveWorkerStates } from '../lib/controller-utils.js'
import {
  applyIncomingSnapshot,
  createInitialAppState,
} from '../lib/messages.js'
import { submitMessage } from '../lib/submit-message.js'

import { useBranding } from './use-branding.js'
import { useComposerDraft } from './use-composer-draft.js'
import { useEventStream } from './use-event-stream.js'
import { useMessageScroll } from './use-message-scroll.js'
import { useTts } from './use-tts.js'

import type {
  ConfirmDialogState,
  QuoteState,
  SnapshotEnvelope,
  ToastState,
} from '../types.js'

const TOAST_HIDE_DELAY_MS = 2_800

export const useAppController = () => {
  const [appState, setAppState] = useState(createInitialAppState)
  const [composerValue, setComposerValue] = useComposerDraft()
  const [quote, setQuote] = useState<QuoteState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [focusesOpen, setFocusesOpen] = useState(false)
  const [openTaskMenuId, setOpenTaskMenuId] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  )
  const [sendPending, setSendPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [choicePending, setChoicePending] = useState({
    choiceId: '',
    optionId: '',
  })
  const [choiceMetaOverrides, setChoiceMetaOverrides] = useState(
    () => new Map<string, string>(),
  )
  const [disconnected, setDisconnected] = useState(false)
  const [statusOverride, setStatusOverride] = useState<{
    state: string
    text: string
  } | null>(null)
  const {
    enabled: ttsEnabled,
    setEnabled: setTtsEnabled,
    supported: ttsSupported,
    speakMessages,
  } = useTts()
  const scroll = useMessageScroll([
    appState.messages,
    appState.awaitingReply,
    appState.choices,
    deleteMode,
  ])

  useBranding(appState.status, appState.focuses)
  useEventStream({
    onSnapshot: (snapshot: SnapshotEnvelope) => {
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
    },
    onTasks: (tasks) =>
      setAppState((current) => ({ ...current, tasks: tasks.tasks })),
    onDisconnected: () => {
      setDisconnected(true)
      setAppState((current) => ({
        ...current,
        awaitingReply: false,
        status: { ...current.status, agentStatus: 'disconnected' },
      }))
    },
  })

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_HIDE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('.tools-menu-wrap')) setToolsMenuOpen(false)
      if (!target.closest('[data-task-actions="true"]')) setOpenTaskMenuId('')
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  const actions = createControllerActions({
    appendClientError: (error) => appendClientError(setAppState, error),
    confirmDialog,
    deleteMode,
    openTaskMenuId,
    quote,
    scroll,
    setAppState,
    setBusy,
    setChoiceMetaOverrides,
    setChoicePending,
    setComposerValue,
    setConfirmDialog,
    setDeleteMode,
    setFocusesOpen,
    setOpenTaskMenuId,
    setPlansOpen,
    setQuote,
    setStatusOverride,
    setTasksOpen,
    setToast,
    setToolsMenuOpen,
    setTtsEnabled,
    submitMessage: () =>
      submitMessage({
        appendClientError: (error) => appendClientError(setAppState, error),
        composerValue,
        quote,
        scroll,
        sendPending,
        setAppState,
        setComposerValue,
        setQuote,
        setSendPending,
      }),
    toolsMenuOpen,
  })

  return {
    appState,
    busy,
    choiceMetaOverrides,
    choicePending,
    composerValue,
    confirmDialog,
    deleteMode,
    disconnected,
    displayState: statusOverride?.state ?? appState.status.agentStatus,
    displayText: formatStatusText(
      statusOverride?.text ?? appState.status.agentStatus,
    ),
    focusesOpen,
    openTaskMenuId,
    plansOpen,
    quote,
    scroll,
    sendPending,
    tasksOpen,
    toast,
    toolsMenuOpen,
    ttsEnabled,
    ttsLabel: !ttsSupported
      ? 'Voice replies: unavailable'
      : ttsEnabled
        ? 'Voice replies: on'
        : 'Voice replies: off',
    workerStates: resolveWorkerStates(
      appState.status.maxWorkers ?? 1,
      appState.status.activeTasks ?? 0,
      disconnected,
    ),
    actions,
  }
}
