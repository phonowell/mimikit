export const normalizeCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

export function clearWorkerDots(workerDots) {
  if (!workerDots) return
  workerDots.innerHTML = ''
  workerDots.removeAttribute('title')
}

const resolveWorkerDotState = (status) => {
  if (!status || typeof status !== 'object') return 'disconnected'
  if (status.agentStatus === 'disconnected') return 'disconnected'
  const activeTasks = normalizeCount(status.activeTasks)
  const pendingTasks = normalizeCount(status.pendingTasks)
  if (activeTasks > 0) return 'running'
  if (pendingTasks > 0) return 'pending'
  if (status.agentStatus === 'running') return 'running'
  return 'success'
}

export function updateWorkerDots(workerDots, status) {
  if (!workerDots) return
  const state = resolveWorkerDotState(status)
  let dot = workerDots.querySelector('.worker-dot')
  if (!(dot instanceof HTMLElement)) {
    workerDots.innerHTML = ''
    dot = document.createElement('span')
    dot.className = 'worker-dot'
    workerDots.appendChild(dot)
  }
  dot.dataset.state = state
  dot.title = `${state}/worker`
  workerDots.title = `${state}/worker`
}
