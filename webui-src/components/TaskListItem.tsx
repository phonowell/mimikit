import { memo } from 'react'

import { buildTaskArchiveViewerUrl } from '../lib/archive-viewer-url.js'
import { resolveTaskStatusLabel } from '../lib/system-text.js'

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

export const TaskListItem = memo(function TaskListItem({
  open,
  onRequestDelete,
  onTaskAction,
  onToggleMenu,
  openMenuId,
  task,
}: Props) {
  const status = task.status || 'pending'
  const title =
    task.title?.trim() && task.title !== task.id ? task.title : 'Untitled task'
  const canPause = status === 'pending' || status === 'running'
  const canResume = status === 'paused'
  const canCancel =
    status === 'pending' || status === 'paused' || status === 'running'
  const canDelete = !canCancel
  const menuOpen = openMenuId === task.id

  return (
    <li className="task-item" data-status={status}>
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
          {task.provider ? (
            <span
              className="task-provider"
              title={`provider: ${task.provider}`}
            >
              {task.provider}
            </span>
          ) : null}
        </div>
        {status === 'running' && task.liveOutput ? (
          <p className="task-live-output" title={task.liveOutput}>
            {task.liveOutput}
          </p>
        ) : null}
        <TaskMeta open={open} task={task} />
      </a>
      <div className="task-item-actions" data-task-actions="true">
        {task.recoverable && canResume ? (
          <button
            className="task-inline-action"
            type="button"
            onClick={() => onTaskAction(task.id, 'resume')}
          >
            Continue
          </button>
        ) : null}
        <button
          className="btn btn--icon btn--icon-muted task-more-toggle"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={`More actions for ${title}`}
          onClick={() => onToggleMenu(task.id)}
        >
          ⋯
        </button>
        <div className="task-more-menu" role="menu" hidden={!menuOpen}>
          <button
            className={`task-menu-item task-menu-item--${canResume ? 'resume' : 'pause'}`}
            type="button"
            role="menuitem"
            disabled={!(canPause || canResume)}
            onClick={() =>
              onTaskAction(task.id, canResume ? 'resume' : 'pause')
            }
          >
            {task.recoverable && canResume
              ? 'continue'
              : canResume
                ? 'resume'
                : 'pause'}
          </button>
          <button
            className="task-menu-item task-menu-item--cancel"
            type="button"
            role="menuitem"
            disabled={!canCancel}
            onClick={() => onTaskAction(task.id, 'cancel')}
          >
            cancel
          </button>
          <button
            className="task-menu-item task-menu-item--delete"
            type="button"
            role="menuitem"
            disabled={!canDelete}
            onClick={() => onRequestDelete(task.id, title)}
          >
            delete
          </button>
          <button
            className="task-menu-item task-menu-item--copy-id"
            type="button"
            role="menuitem"
            onClick={() => onTaskAction(task.id, 'copy-id')}
          >
            copy id
          </button>
        </div>
      </div>
    </li>
  )
})
