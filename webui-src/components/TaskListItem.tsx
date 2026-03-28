import { useId, useRef } from 'react'

import { buildTaskArchiveViewerUrl } from '../lib/archive-viewer-url.js'
import { resolveTaskStatusLabel } from '../lib/system-text.js'

import { TaskActionMenu } from './TaskActionMenu.js'
import { TaskMeta } from './TaskMeta.js'

import type { TaskView } from '../types.js'

type Props = {
  open: boolean
  onRequestDelete: (taskId: string, title: string) => void
  onTaskAction: (
    taskId: string,
    action: 'cancel' | 'pause' | 'resume' | 'copy-id',
  ) => void
  onToggleMenu: (taskId: string) => void
  openMenuId: string
  task: TaskView
}

export const TaskListItem = ({
  open,
  onRequestDelete,
  onTaskAction,
  onToggleMenu,
  openMenuId,
  task,
}: Props) => {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const status = task.status || 'pending'
  const title =
    task.title?.trim() && task.title !== task.id ? task.title : 'Untitled task'
  const canPause = status === 'pending' || status === 'running'
  const canResume = status === 'paused'
  const canCancel =
    status === 'pending' || status === 'paused' || status === 'running'
  const canDelete = !canCancel
  const menuOpen = openMenuId === task.id
  const menuId = useId()

  return (
    <li className="task-item" data-status={status}>
      <div className="task-item-main">
        <a
          className="task-link"
          data-status={status}
          href={buildTaskArchiveViewerUrl(task.id)}
          target="_blank"
          rel="noreferrer"
        >
          <div className="task-title-row">
            <span
              className="task-status"
              data-status={status}
              role="img"
              aria-label={resolveTaskStatusLabel(status)}
              title={status}
            ></span>
            <span className="task-title">{title}</span>
          </div>
          {status === 'running' && task.liveOutput ? (
            <p className="task-live-output" title={task.liveOutput}>
              {task.liveOutput}
            </p>
          ) : null}
          <TaskMeta open={open} task={task} />
        </a>
        <div className="task-item-actions" data-task-actions="true">
          <button
            ref={toggleRef}
            className="btn btn--icon btn--icon-muted task-more-toggle"
            type="button"
            id={menuId}
            aria-controls={menuOpen ? `${menuId}-menu` : undefined}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={`More actions for ${title}`}
            onClick={() => onToggleMenu(task.id)}
          >
            ⋯
          </button>
          <TaskActionMenu
            canCancel={canCancel}
            canDelete={canDelete}
            canPause={canPause}
            canResume={canResume}
            menuId={menuId}
            menuOpen={menuOpen}
            onRequestDelete={onRequestDelete}
            onTaskAction={onTaskAction}
            taskId={task.id}
            title={title}
            toggleRef={toggleRef}
          />
        </div>
      </div>
    </li>
  )
}
