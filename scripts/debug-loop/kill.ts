import { spawn } from 'node:child_process'

export const killProcessTree = async (pid: number) => {
  if (!Number.isFinite(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const child = spawn(
        'taskkill',
        ['/PID', String(pid), '/T', '/F'],
        { stdio: 'ignore' },
      )
      child.on('exit', () => resolve())
      child.on('error', () => resolve())
    })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // ignore
    }
  }
}
