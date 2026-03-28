import { createContext, useContext } from 'react'

import type {
  ComposerSurface,
  ConfirmDialogsSurface,
  HeaderSurface,
  MessageListSurface,
  PlansDialogSurface,
  TasksDialogSurface,
} from './view-types.js'
import type { Context } from 'react'

const useRequiredContext = <T>(context: Context<T | null>, name: string) => {
  const value = useContext(context)
  if (value === null) throw new Error(`Missing ${name}`)
  return value
}

export const HeaderSurfaceContext = createContext<HeaderSurface | null>(null)
export const MessageListSurfaceContext =
  createContext<MessageListSurface | null>(null)
export const ComposerSurfaceContext = createContext<ComposerSurface | null>(
  null,
)
export const TasksDialogSurfaceContext =
  createContext<TasksDialogSurface | null>(null)
export const PlansDialogSurfaceContext =
  createContext<PlansDialogSurface | null>(null)
export const ConfirmDialogsSurfaceContext =
  createContext<ConfirmDialogsSurface | null>(null)

export const useHeaderSurface = () =>
  useRequiredContext(HeaderSurfaceContext, 'HeaderSurfaceContext')
export const useMessageListSurface = () =>
  useRequiredContext(MessageListSurfaceContext, 'MessageListSurfaceContext')
export const useComposerSurface = () =>
  useRequiredContext(ComposerSurfaceContext, 'ComposerSurfaceContext')
export const useTasksDialogSurface = () =>
  useRequiredContext(TasksDialogSurfaceContext, 'TasksDialogSurfaceContext')
export const usePlansDialogSurface = () =>
  useRequiredContext(PlansDialogSurfaceContext, 'PlansDialogSurfaceContext')
export const useConfirmDialogsSurface = () =>
  useRequiredContext(
    ConfirmDialogsSurfaceContext,
    'ConfirmDialogsSurfaceContext',
  )
