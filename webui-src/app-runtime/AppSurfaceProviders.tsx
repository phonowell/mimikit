import {
  ComposerSurfaceContext,
  ConfirmDialogsSurfaceContext,
  HeaderSurfaceContext,
  MessageListSurfaceContext,
  PlansDialogSurfaceContext,
  TasksDialogSurfaceContext,
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
  confirmDialogsSurface,
}: SurfaceProps) => (
  <HeaderSurfaceContext value={headerSurface}>
    <MessageListSurfaceContext value={messageListSurface}>
      <ComposerSurfaceContext value={composerSurface}>
        <TasksDialogSurfaceContext value={tasksDialogSurface}>
          <PlansDialogSurfaceContext value={plansDialogSurface}>
            <ConfirmDialogsSurfaceContext value={confirmDialogsSurface}>
              {children}
            </ConfirmDialogsSurfaceContext>
          </PlansDialogSurfaceContext>
        </TasksDialogSurfaceContext>
      </ComposerSurfaceContext>
    </MessageListSurfaceContext>
  </HeaderSurfaceContext>
)
