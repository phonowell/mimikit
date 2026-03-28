import { FloatingActionMenu } from './FloatingActionMenu.js'

import type { RefObject } from 'react'

type Props = {
  canCancel: boolean
  canDelete: boolean
  canPause: boolean
  canResume: boolean
  menuId: string
  menuOpen: boolean
  onRequestDelete: (taskId: string, title: string) => void
  onTaskAction: (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => void
  title: string
  toggleRef: RefObject<HTMLButtonElement | null>
  taskId: string
}

export const TaskActionMenu = ({
  canCancel,
  canDelete,
  canPause,
  canResume,
  menuId,
  menuOpen,
  onRequestDelete,
  onTaskAction,
  title,
  toggleRef,
  taskId,
}: Props) => {
  if (!menuOpen) return null

  return (
    <FloatingActionMenu
      className="task-more-menu"
      menuId={menuId}
      menuOpen={menuOpen}
      toggleRef={toggleRef}
    >
      <button
        className="task-menu-item task-menu-item--copy-id"
        type="button"
        role="menuitem"
        onClick={() => onTaskAction(taskId, 'copy-id')}
      >
        copy id
      </button>
      <button
        className={`task-menu-item task-menu-item--${canResume ? 'resume' : 'pause'}`}
        type="button"
        role="menuitem"
        disabled={!(canPause || canResume)}
        onClick={() => onTaskAction(taskId, canResume ? 'resume' : 'pause')}
      >
        {canResume ? 'resume' : 'pause'}
      </button>
      <button
        className="task-menu-item task-menu-item--cancel"
        type="button"
        role="menuitem"
        disabled={!canCancel}
        onClick={() => onTaskAction(taskId, 'cancel')}
      >
        cancel
      </button>
      <button
        className="task-menu-item task-menu-item--delete"
        type="button"
        role="menuitem"
        disabled={!canDelete}
        onClick={() => onRequestDelete(taskId, title)}
      >
        delete
      </button>
    </FloatingActionMenu>
  )
}
