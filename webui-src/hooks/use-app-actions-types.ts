import type {
  AppState,
  ConfirmDialogState,
  QuoteState,
  ToastState,
} from '../types.js'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

export type ScrollController = {
  captureLayoutShift: () => void
}

export type ChoicePendingState = { choiceId: string; optionId: string }

export type AppActionState = {
  composerValue: string
  confirmDialog: ConfirmDialogState | null
  deleteMode: boolean
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
  openTaskMenuId: string
  quote: QuoteState | null
  scroll: ScrollController
  sendPending: boolean
  setAppState: Dispatch<SetStateAction<AppState>>
  setBusy: Dispatch<SetStateAction<boolean>>
  setChoiceMetaOverrides: Dispatch<SetStateAction<Map<string, string>>>
  setChoicePending: Dispatch<SetStateAction<ChoicePendingState>>
  setComposerValue: (value: string) => void
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
  setDeleteMode: Dispatch<SetStateAction<boolean>>
  setFocusesOpen: Dispatch<SetStateAction<boolean>>
  setOpenTaskMenuId: Dispatch<SetStateAction<string>>
  setPlansOpen: Dispatch<SetStateAction<boolean>>
  setQuote: Dispatch<SetStateAction<QuoteState | null>>
  setSendPending: Dispatch<SetStateAction<boolean>>
  setStatusOverride: Dispatch<
    SetStateAction<{ state: string; text: string } | null>
  >
  setTasksOpen: Dispatch<SetStateAction<boolean>>
  setToast: Dispatch<SetStateAction<ToastState | null>>
  setToolsMenuOpen: Dispatch<SetStateAction<boolean>>
  setTtsEnabled: (enabled: boolean) => void
  toolsMenuOpen: boolean
}
