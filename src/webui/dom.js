export const $ = (sel) => document.querySelector(sel)

export function selectAppElements() {
  return {
    statusDot: $('[data-status-dot]'),
    statusText: $('[data-status-text]'),
    messagesEl: $('[data-messages]'),
    scrollBottomBtn: $('[data-scroll-bottom]'),
    form: $('[data-form]'),
    input: $('[data-input]'),
    sendBtn: $('[data-send]'),
    restartBtn: $('[data-restart]'),
    restartDialog: $('[data-restart-dialog]'),
    restartCancelBtn: $('[data-restart-cancel]'),
    restartConfirmBtn: $('[data-restart-confirm]'),
    restartResetBtn: $('[data-restart-reset]'),
    tasksDialog: $('[data-tasks-dialog]'),
    tasksOpenBtn: $('[data-tasks-open]'),
    tasksCloseBtn: $('[data-tasks-close]'),
    tasksList: $('[data-tasks-list]'),
    tasksMeta: $('[data-tasks-meta]'),
  }
}
