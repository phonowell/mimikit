import { UI_TEXT } from './system-text.js'

export const TASK_ACTION_ENDPOINT = Object.freeze({
  cancel: 'cancel',
  delete: 'delete',
  pause: 'pause',
  resume: 'resume',
})

export const TASK_ACTION_BUSY_TEXT = Object.freeze({
  cancel: UI_TEXT.cancelingTask,
  'copy-id': UI_TEXT.copyingTaskId,
  delete: UI_TEXT.deletingTask,
  pause: UI_TEXT.pausingTask,
  resume: UI_TEXT.resumingTask,
})
