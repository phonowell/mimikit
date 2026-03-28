import type { AppState, ConfirmDialogState, QuoteState } from '../types.js'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

export type ScrollController = {
  captureLayoutShift: () => void
}

export type AppActionState = {
  composerValue: string
  confirmDialog: ConfirmDialogState | null
  deleteMode: boolean
  openPlanMenuId: string
  openTaskMenuId: string
  quote: QuoteState | null
  sendPending: boolean
  toolsMenuOpen: boolean
}

export type AppActionStateRef = MutableRefObject<AppActionState>

export type AppActionParams = {
  composerValue: string
  confirmDialog: ConfirmDialogState | null
  deleteMode: boolean
  openPlanMenuId: string
  openTaskMenuId: string
  quote: QuoteState | null
  scroll: ScrollController
  sendPending: boolean
  setAppState: Dispatch<SetStateAction<AppState>>
  setBusy: Dispatch<SetStateAction<boolean>>
  setComposerValue: (value: string) => void
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
  setDeleteMode: Dispatch<SetStateAction<boolean>>
  setOpenPlanMenuId: Dispatch<SetStateAction<string>>
  setOpenTaskMenuId: Dispatch<SetStateAction<string>>
  setPlansOpen: Dispatch<SetStateAction<boolean>>
  setQuote: Dispatch<SetStateAction<QuoteState | null>>
  setSendPending: Dispatch<SetStateAction<boolean>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setTasksOpen: Dispatch<SetStateAction<boolean>>
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
  toolsMenuOpen: boolean
}
