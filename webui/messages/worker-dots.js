export const normalizeCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

const DEFAULT_WORKER_SLOT_COUNT = 1

export function clearWorkerDots(workerDots) {
  if (!workerDots) return
  workerDots.innerHTML = ''
  delete workerDots.dataset.slotCount
  workerDots.removeAttribute('title')
}

const resolveSlotCount = (workerDots, status) => {
  if (!status || typeof status !== 'object')
    return normalizeCount(Number(workerDots.dataset.slotCount))

  const maxWorkers = normalizeCount(status.maxWorkers)
  if (maxWorkers > 0) {
    workerDots.dataset.slotCount = String(maxWorkers)
    return maxWorkers
  }
  return normalizeCount(Number(workerDots.dataset.slotCount))
}

export function updateWorkerDots(workerDots, status) {
  if (!workerDots) return
  const slotCount =
    resolveSlotCount(workerDots, status) || DEFAULT_WORKER_SLOT_COUNT
  const isDisconnected =
    status && typeof status === 'object' && status.agentStatus === 'disconnected'
  const runningCount = isDisconnected
    ? 0
    : Math.min(slotCount, normalizeCount(status?.activeTasks))
  const dots = workerDots.querySelectorAll('.worker-dot')
  if (dots.length !== slotCount) {
    workerDots.innerHTML = ''
    for (let index = 0; index < slotCount; index += 1) {
      const dot = document.createElement('span')
      dot.className = 'worker-dot'
      workerDots.appendChild(dot)
    }
  }
  const renderedDots = workerDots.querySelectorAll('.worker-dot')
  for (let index = 0; index < renderedDots.length; index += 1) {
    const dot = renderedDots[index]
    const state = index < runningCount ? 'running' : 'idle'
    dot.dataset.state = state
    dot.title = `${state}/worker-${index + 1}`
  }
  const statusTitle = isDisconnected ? 'disconnected' : 'connected'
  workerDots.title = `${statusTitle} ${runningCount}/${slotCount} running`
}
