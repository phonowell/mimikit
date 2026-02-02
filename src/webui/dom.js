export const $ = (sel) => document.querySelector(sel)

export function selectAppElements() {
  return {
    statusDot: $('[data-status-dot]'),
    statusText: $('[data-status-text]'),
    thinkerDot: $('[data-thinker-dot]'),
    thinkerText: $('[data-thinker-text]'),
    messagesEl: $('[data-messages]'),
    scrollBottomBtn: $('[data-scroll-bottom]'),
    form: $('[data-form]'),
    input: $('[data-input]'),
    sendBtn: $('[data-send]'),
    restartBtn: $('[data-restart]'),
    tasksBtn: $('[data-tasks-btn]'),
    tasksModal: $('[data-tasks-modal]'),
    tasksList: $('[data-tasks-list]'),
    tasksMeta: $('[data-tasks-meta]'),
    tasksCloseBtn: $('[data-tasks-close]'),
  }
}
