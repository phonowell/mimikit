import {
  ComposerSurfaceContext,
  ConfirmDialogsSurfaceContext,
  FocusDialogSurfaceContext,
  HeaderSurfaceContext,
  MessageListSurfaceContext,
  PlansDialogSurfaceContext,
  TasksDialogSurfaceContext,
  ToastSurfaceContext,
} from './surface-contexts.js'

import type { useAppSurfaces } from './use-app-surfaces.js'
import type { PropsWithChildren } from 'react'

type SurfaceProps = PropsWithChildren<ReturnType<typeof useAppSurfaces>>

export const AppSurfaceProviders = ({
  children,
  headerSurface,
  messageListSurface,
  composerSurface,
  tasksDialogSurface,
  plansDialogSurface,
  focusDialogSurface,
  confirmDialogsSurface,
  toastSurface,
}: SurfaceProps) => (
  <HeaderSurfaceContext value={headerSurface}>
    <MessageListSurfaceContext value={messageListSurface}>
      <ComposerSurfaceContext value={composerSurface}>
        <TasksDialogSurfaceContext value={tasksDialogSurface}>
          <PlansDialogSurfaceContext value={plansDialogSurface}>
            <FocusDialogSurfaceContext value={focusDialogSurface}>
              <ConfirmDialogsSurfaceContext value={confirmDialogsSurface}>
                <ToastSurfaceContext value={toastSurface}>
                  {children}
                </ToastSurfaceContext>
              </ConfirmDialogsSurfaceContext>
            </FocusDialogSurfaceContext>
          </PlansDialogSurfaceContext>
        </TasksDialogSurfaceContext>
      </ComposerSurfaceContext>
    </MessageListSurfaceContext>
  </HeaderSurfaceContext>
)
