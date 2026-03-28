import type {
  ConfirmDialogState,
  PlanView,
  QuoteState,
  TaskView,
  ToastState,
  ChatMessage,
} from '../types.js'
import type { RefObject } from 'react'

export type HeaderSurface = {
  statusText: string
  statusState: string
  workerStates: string[]
  hasPlans: boolean
  toolsMenuOpen: boolean
  ttsLabel: string
  toolsDisabled: boolean
  onOpenPlans: () => void
  onOpenTasks: () => void
  onPreloadPlans: () => void
  onPreloadTasks: () => void
  onToggleTools: () => void
  onToggleTts: () => void
  onToggleDeleteMode: () => void
  onOpenRestart: () => void
  onOpenReset: () => void
}

export type MessageListSurface = {
  messages: ChatMessage[]
  loading: boolean
  deleteMode: boolean
  listRef: RefObject<HTMLUListElement | null>
  scrollButtonVisible: boolean
  onScrollBottom: () => void
  onQuote: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
}

export type ComposerSurface = {
  deleteMode: boolean
  value: string
  sendPending: boolean
  quote: QuoteState | null
  isNearBottom: boolean
  onChange: (value: string) => void
  onClearQuote: () => void
  onLayoutShift: (stickToBottom: boolean) => void
  onSubmit: () => void
  onExitDeleteMode: () => void
}

export type TasksDialogSurface = {
  open: boolean
  tasks: TaskView[]
  openMenuId: string
  onClose: () => void
  onToggleMenu: (taskId: string) => void
  onTaskAction: (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => void
  onRequestDelete: (taskId: string, title: string) => void
}

export type PlansDialogSurface = {
  open: boolean
  openMenuId: string
  plans: PlanView[]
  onClose: () => void
  onPlanAction: (planId: string, action: 'copy-id') => void
  onToggleMenu: (planId: string) => void
}

export type ConfirmDialogsSurface = {
  dialog: ConfirmDialogState | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}

export type ToastSurface = {
  toast: ToastState | null
}
