export const normalizeCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

export function clearWorkerDots(workerDots) {
  if (workerDots) workerDots.innerHTML = ''
}

export function updateWorkerDots(workerDots, status) {
  if (!workerDots) return
  const maxWorkers = normalizeCount(status?.maxWorkers ?? status?.maxConcurrent)
  if (maxWorkers <= 0) {
    workerDots.innerHTML = ''
    return
  }
  if (workerDots.childElementCount !== maxWorkers) {
    workerDots.innerHTML = ''
    for (let i = 0; i < maxWorkers; i += 1) {
      const dot = document.createElement('span')
      dot.className = 'worker-dot'
      workerDots.appendChild(dot)
    }
  }
  const activeWorkers = Math.min(normalizeCount(status?.activeTasks), maxWorkers)
  const dots = workerDots.querySelectorAll('.worker-dot')
  for (let i = 0; i < dots.length; i += 1) {
    const dot = dots[i]
    if (dot instanceof HTMLElement) {
      dot.dataset.active = i < activeWorkers ? 'true' : 'false'
    }
  }
}
