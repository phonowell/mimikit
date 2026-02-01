import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createAbortHandler } from './debug-loop/autofix.js'
import { createLogTail } from './debug-loop/tail.js'
import { killProcessTree } from './debug-loop/kill.js'
import { ensureDir, nowStamp, toInt, toMs } from './debug-loop/utils.js'

const run = async () => {
  const cleanedArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const { values } = parseArgs({
    args: cleanedArgs,
    allowPositionals: true,
    options: {
      'state-dir': { type: 'string' },
      'work-dir': { type: 'string' },
      'log-path': { type: 'string' },
      'report-dir': { type: 'string' },
      'start-cmd': { type: 'string' },
      'auto-fix': { type: 'boolean' },
      threshold: { type: 'string' },
      'window-sec': { type: 'string' },
      'timeout-step-sec': { type: 'string' },
      'timeout-max-sec': { type: 'string' },
      'timeout-initial-sec': { type: 'string' },
      'restart-cooldown-sec': { type: 'string' },
      'poll-ms': { type: 'string' },
    },
  })
  const stateDir = resolve(values['state-dir'] ?? '.mimikit')
  const workDir = resolve(values['work-dir'] ?? '.')
  const logPath = resolve(values['log-path'] ?? join(stateDir, 'log.jsonl'))
  const reportDir = resolve(values['report-dir'] ?? join('reports', 'diagnostics'))
  const startCmd =
    values['start-cmd'] ?? process.env.MIMIKIT_DEBUG_START_CMD ?? 'pnpm start:windows'

  const hasNoAutoFix = process.argv.includes('--no-auto-fix')
  const autoFix = hasNoAutoFix ? false : (values['auto-fix'] ?? true)

  const threshold = toInt(values.threshold, 3)
  const windowMs = toMs(toInt(values['window-sec'], 300))
  const timeoutStepMs = toMs(toInt(values['timeout-step-sec'], 30))
  const timeoutMaxMs = toMs(toInt(values['timeout-max-sec'], 300))
  const timeoutInitialMs = toMs(toInt(values['timeout-initial-sec'], 120))
  const restartCooldownMs = toMs(toInt(values['restart-cooldown-sec'], 60))
  const pollMs = Math.max(200, toInt(values['poll-ms'], 1000))

  let currentTimeoutMs =
    Number(process.env.MIMIKIT_TELLER_TIMEOUT_MS) || timeoutInitialMs
  if (currentTimeoutMs <= 0) currentTimeoutMs = timeoutInitialMs
  if (currentTimeoutMs > timeoutMaxMs) currentTimeoutMs = timeoutMaxMs

  let child: ReturnType<typeof spawn> | null = null
  let stopping = false

  const log = (message: string) => {
    const stamp = new Date().toISOString()
    console.log(`[debug-loop] ${stamp} ${message}`)
  }

  const writeReport = async (payload: Record<string, unknown>) => {
    await ensureDir(reportDir)
    const filename = join(reportDir, `auto-fix-${nowStamp()}.json`)
    const enriched = {
      ...payload,
      env: {
        OPENAI_MODEL: process.env.OPENAI_MODEL ?? null,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? null,
        OPENAI_WIRE_API: process.env.OPENAI_WIRE_API ?? null,
        OPENAI_API_KEY_PRESENT: Boolean(process.env.OPENAI_API_KEY),
      },
      startCmd,
      logPath,
      stateDir,
      workDir,
    }
    await writeFile(filename, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8')
    const latest = join(reportDir, 'latest.md')
    const summary = [
      `# Auto debug latest`,
      ``,
      `- time: ${new Date().toISOString()}`,
      `- reason: ${String(payload.reason ?? 'unknown')}`,
      `- aborts: ${String(payload.abortCount ?? '-')}`,
      `- threshold: ${String(payload.threshold ?? '-')}`,
      `- timeout: ${String(payload.timeoutBefore ?? '-')}` +
        ` -> ${String(payload.timeoutAfter ?? '-')}`,
      `- startCmd: ${startCmd}`,
      `- logPath: ${logPath}`,
    ].join('\n')
    await writeFile(latest, `${summary}\n`, 'utf8')
  }

  const stopChild = async () => {
    if (!child || child.killed) return
    stopping = true
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child?.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (child && !child.killed) await killProcessTree(child.pid)
    stopping = false
  }

  const startChild = () => {
    const env = {
      ...process.env,
      MIMIKIT_TELLER_TIMEOUT_MS: String(currentTimeoutMs),
      MIMIKIT_DEBUG_LOOP: '1',
    }
    child = spawn(startCmd, { shell: true, cwd: workDir, env, stdio: 'inherit' })
    child.on('exit', (code, signal) => {
      if (stopping) return
      log(`child exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    })
    log(`started child with MIMIKIT_TELLER_TIMEOUT_MS=${currentTimeoutMs}`)
  }

  const { handleEntry } = createAbortHandler({
    threshold,
    windowMs,
    autoFix,
    restartCooldownMs,
    timeoutStepMs,
    timeoutMaxMs,
    getTimeout: () => currentTimeoutMs,
    setTimeout: (value) => {
      currentTimeoutMs = value
    },
    onRestart: async () => {
      await stopChild()
      startChild()
    },
    writeReport,
    log,
  })

  if (!existsSync(stateDir)) await ensureDir(stateDir)
  await ensureDir(reportDir)
  log(`logPath=${logPath}`)
  log(`autoFix=${autoFix}`)
  startChild()

  const pollLog = createLogTail(logPath, handleEntry)
  const timer = setInterval(() => {
    void pollLog()
  }, pollMs)

  const shutdown = async () => {
    clearInterval(timer)
    await stopChild()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

run().catch((error) => {
  console.error('[debug-loop] fatal', error)
  process.exit(1)
})
