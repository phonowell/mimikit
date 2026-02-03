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
    tasksList: $('[data-tasks-list]'),
    tasksMeta: $('[data-tasks-meta]'),
  }
}
