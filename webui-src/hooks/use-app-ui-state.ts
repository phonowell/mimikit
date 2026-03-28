import { useState } from 'react'

import type {
  ConfirmDialogState,
  CopyFeedbackState,
  QuoteState,
} from '../types.js'

export const useAppUiState = () => {
  const [quote, setQuote] = useState<QuoteState | null>(null)
  const [taskCopyFeedback, setTaskCopyFeedback] =
    useState<CopyFeedbackState | null>(null)
  const [planCopyFeedback, setPlanCopyFeedback] =
    useState<CopyFeedbackState | null>(null)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [openTaskMenuId, setOpenTaskMenuId] = useState('')
  const [openPlanMenuId, setOpenPlanMenuId] = useState('')
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
    openPlanMenuId,
    openTaskMenuId,
    planCopyFeedback,
    plansOpen,
    quote,
    sendPending,
    statusOverride,
    taskCopyFeedback,
    tasksOpen,
    toolsMenuOpen,
    setBusy,
    setConfirmDialog,
    setDeleteMode,
    setOpenPlanMenuId,
    setOpenTaskMenuId,
    setPlanCopyFeedback,
    setPlansOpen,
    setQuote,
    setSendPending,
    setStatusOverride,
    setTaskCopyFeedback,
    setTasksOpen,
    setToolsMenuOpen,
  }
}
