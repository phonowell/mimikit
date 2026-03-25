import { memo } from 'react'

import { UI_TEXT } from '../lib/system-text.js'

import { ModalDialog } from './ModalDialog.js'
import { TaskListItem } from './TaskListItem.js'

import type { TaskView } from '../types.js'

type Props = {
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

export const TasksDialog = memo(function TasksDialog({
  open,
  tasks,
  openMenuId,
  onClose,
  onToggleMenu,
  onTaskAction,
  onRequestDelete,
}: Props) {
  return (
    <ModalDialog
      open={open}
      className="tasks-dialog"
      id="tasks-dialog"
      labelledBy="tasks-title"
      onClose={onClose}
      title={null}
    >
      <section className="tasks-panel">
        <header className="tasks-header">
          <h2 className="tasks-title" id="tasks-title">
            Tasks
          </h2>
          <div className="tasks-actions" role="group" aria-label="Tasks">
            <button
              className="btn btn--icon btn--icon-muted tasks-close"
              type="button"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>
        <ul className="tasks-list scrollable">
          {tasks.length === 0 ? (
            <li className="list-empty tasks-empty">{UI_TEXT.noTasks}</li>
          ) : null}
          {tasks.map((task) => (
            <TaskListItem
              key={task.id}
              open={open}
              task={task}
              openMenuId={openMenuId}
              onRequestDelete={onRequestDelete}
              onTaskAction={onTaskAction}
              onToggleMenu={onToggleMenu}
            />
          ))}
        </ul>
      </section>
    </ModalDialog>
  )
})
