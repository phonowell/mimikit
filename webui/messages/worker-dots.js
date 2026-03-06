export const normalizeCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

const DEFAULT_WORKER_SLOT_COUNT = 1
const DOT_TRANSITION_CLASS = 'worker-dot--state-transition'
const DOT_TRANSITION_DURATION_MS = 3000
const DOT_TRANSITION_CLEANUP_GRACE_MS = 120
const transitionCleanupTimers = new WeakMap()

const resolveTransitionState = ({ previousState, nextState }) => {
  if (!previousState || previousState === nextState) return ''
  if (nextState === 'running') return 'engage'
  if (previousState === 'running' && nextState === 'idle') return 'release'
  if (nextState === 'disconnected') return 'offline'
  if (previousState === 'disconnected') return 'recover'
  return 'shift'
}

const bindTransitionCleanup = (dot) => {
  if (!dot || dot.dataset.transitionBound === '1') return
  dot.dataset.transitionBound = '1'
  const clearTransitionState = () => {
    const timer = transitionCleanupTimers.get(dot)
    if (timer) {
      clearTimeout(timer)
      transitionCleanupTimers.delete(dot)
    }
    dot.classList.remove(DOT_TRANSITION_CLASS)
    delete dot.dataset.transition
  }
  dot.addEventListener('animationend', clearTransitionState)
  dot.addEventListener('animationcancel', clearTransitionState)
}

const scheduleTransitionCleanup = (dot) => {
  const previousTimer = transitionCleanupTimers.get(dot)
  if (previousTimer) clearTimeout(previousTimer)
  const timer = setTimeout(() => {
    dot.classList.remove(DOT_TRANSITION_CLASS)
    delete dot.dataset.transition
    transitionCleanupTimers.delete(dot)
  }, DOT_TRANSITION_DURATION_MS + DOT_TRANSITION_CLEANUP_GRACE_MS)
  transitionCleanupTimers.set(dot, timer)
}

const applyTransitionState = (dot, previousState, nextState) => {
  const transition = resolveTransitionState({ previousState, nextState })
  if (!transition) return
  dot.dataset.transition = transition
  dot.classList.remove(DOT_TRANSITION_CLASS)
  void dot.offsetWidth
  dot.classList.add(DOT_TRANSITION_CLASS)
  scheduleTransitionCleanup(dot)
}

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
      bindTransitionCleanup(dot)
      workerDots.appendChild(dot)
    }
  }
  const renderedDots = workerDots.querySelectorAll('.worker-dot')
  for (let index = 0; index < renderedDots.length; index += 1) {
    const dot = renderedDots[index]
    bindTransitionCleanup(dot)
    const previousState = dot.dataset.state
    const state = isDisconnected
      ? 'disconnected'
      : index < runningCount
        ? 'running'
        : 'idle'
    applyTransitionState(dot, previousState, state)
    dot.dataset.state = state
    dot.title = `${state}/worker-${index + 1}`
  }
  const statusTitle = isDisconnected ? 'disconnected' : 'connected'
  workerDots.title = `${statusTitle} ${runningCount}/${slotCount} running`
}
