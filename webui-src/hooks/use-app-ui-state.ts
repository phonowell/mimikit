import { useState } from 'react'

import type { ConfirmDialogState, QuoteState, ToastState } from '../types.js'

export const useAppUiState = () => {
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
  const [statusOverride, setStatusOverride] = useState<{
    state: string
    text: string
  } | null>(null)

  return {
    busy,
    confirmDialog,
    deleteMode,
    focusesOpen,
    openTaskMenuId,
    plansOpen,
    quote,
    sendPending,
    statusOverride,
    tasksOpen,
    toast,
    toolsMenuOpen,
    setBusy,
    setConfirmDialog,
    setDeleteMode,
    setFocusesOpen,
    setOpenTaskMenuId,
    setPlansOpen,
    setQuote,
    setSendPending,
    setStatusOverride,
    setTasksOpen,
    setToast,
    setToolsMenuOpen,
  }
}
