import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { postInput, waitForStatus } from './smoke/http.js'
import { getFreePort, sleep, withTimeout } from './smoke/utils.js'

import { createAbortHandler } from './debug-loop/autofix.js'
import { buildCommand, resolveStartCmd } from './debug-repro/command.js'
import { loadReplayTexts, prepareState } from './debug-repro/state.js'
import { createLogTail } from './debug-loop/tail.js'
import { killProcessTree } from './debug-loop/kill.js'
import { ensureDir, nowStamp, toInt, toMs } from './debug-loop/utils.js'

const run = async () => {
  const cleanedArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const { values } = parseArgs({
    args: cleanedArgs,
    allowPositionals: true,
    options: {
      'source-state-dir': { type: 'string' },
      'state-dir': { type: 'string' },
      'work-dir': { type: 'string' },
      'report-dir': { type: 'string' },
      'start-cmd': { type: 'string' },
      port: { type: 'string' },
      model: { type: 'string' },
      'replay-mode': { type: 'string' },
      'replay-count': { type: 'string' },
      'auto-fix': { type: 'boolean' },
      threshold: { type: 'string' },
      'window-sec': { type: 'string' },
      'timeout-step-sec': { type: 'string' },
      'timeout-max-sec': { type: 'string' },
      'timeout-initial-sec': { type: 'string' },
      'restart-cooldown-sec': { type: 'string' },
      'poll-ms': { type: 'string' },
      'no-reset-state': { type: 'boolean' },
      'run-seconds': { type: 'string' },
    },
  })

  const sourceStateDir = resolve(values['source-state-dir'] ?? '.mimikit')
  const stateDir = resolve(values['state-dir'] ?? '.mimikit-smoke')
  const workDir = resolve(values['work-dir'] ?? '.')
  const reportDir = resolve(values['report-dir'] ?? join('reports', 'diagnostics'))
  const startCmdRaw =
    values['start-cmd'] ?? process.env.MIMIKIT_DEBUG_START_CMD ?? 'pnpm start:windows'
  const startCmd = resolveStartCmd(startCmdRaw)

  const replayMode = (values['replay-mode'] ?? 'auto').toLowerCase()
  const replayCount = Math.max(1, toInt(values['replay-count'], 1))
  const resetState = values['no-reset-state'] ? false : true

  const hasNoAutoFix = process.argv.includes('--no-auto-fix')
  const autoFix = hasNoAutoFix ? false : (values['auto-fix'] ?? true)

  const threshold = toInt(values.threshold, 3)
  const windowMs = toMs(toInt(values['window-sec'], 300))
  const timeoutStepMs = toMs(toInt(values['timeout-step-sec'], 30))
  const timeoutMaxMs = toMs(toInt(values['timeout-max-sec'], 300))
  const timeoutInitialMs = toMs(toInt(values['timeout-initial-sec'], 120))
  const restartCooldownMs = toMs(toInt(values['restart-cooldown-sec'], 60))
  const pollMs = Math.max(200, toInt(values['poll-ms'], 1000))
  const runSeconds = toInt(values['run-seconds'], 0)

  let currentTimeoutMs =
    Number(process.env.MIMIKIT_TELLER_TIMEOUT_MS) || timeoutInitialMs
  if (currentTimeoutMs <= 0) currentTimeoutMs = timeoutInitialMs
  if (currentTimeoutMs > timeoutMaxMs) currentTimeoutMs = timeoutMaxMs

  const token =
    process.env.MIMIKIT_API_KEY ?? `debug-${randomBytes(4).toString('hex')}`
  const port =
    values.port && values.port.trim().length > 0
      ? Number.parseInt(values.port, 10)
      : await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const logPath = join(stateDir, 'log.jsonl')
  const model = values.model?.trim()

  let child: ReturnType<typeof spawn> | null = null
  let stopping = false

  const log = (message: string) => {
    const stamp = new Date().toISOString()
    console.log(`[debug-repro] ${stamp} ${message}`)
  }

  const writeReport = async (payload: Record<string, unknown>) => {
    await ensureDir(reportDir)
    const filename = join(reportDir, `debug-repro-${nowStamp()}.json`)
    const enriched = {
      ...payload,
      startCmd,
      startCmdRaw,
      baseUrl,
      port,
      stateDir,
      sourceStateDir,
      workDir,
      model,
      replayMode,
      replayCount,
      resetState,
      logPath,
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
      `- baseUrl: ${baseUrl}`,
      `- stateDir: ${stateDir}`,
      `- sourceStateDir: ${sourceStateDir}`,
      `- replayMode: ${replayMode}`,
      `- replayCount: ${replayCount}`,
    ].join('\n')
    await writeFile(latest, `${summary}\n`, 'utf8')
  }

  const resetParams = {
    sourceStateDir,
    stateDir,
    reset: resetState,
  }

  const stopChild = async () => {
    if (!child || child.killed) return
    stopping = true
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child?.once('exit', resolve)),
      sleep(5000),
    ])
    if (child && !child.killed) await killProcessTree(child.pid)
    stopping = false
  }

  const startChild = () => {
    const env = {
      ...process.env,
      MIMIKIT_TELLER_TIMEOUT_MS: String(currentTimeoutMs),
      MIMIKIT_API_KEY: token,
      MIMIKIT_DEBUG_REPRO: '1',
    }
    const args = [
      '--port',
      String(port),
      '--state-dir',
      stateDir,
      '--work-dir',
      workDir,
      ...(model ? ['--model', model] : []),
    ]
    const cmd = buildCommand(startCmd, args)
    child = spawn(cmd, { shell: true, cwd: workDir, env, stdio: 'inherit' })
    child.on('exit', (code, signal) => {
      if (stopping) return
      log(`child exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    })
    if (startCmd !== startCmdRaw) {
      log(`start-cmd remapped: "${startCmdRaw}" -> "${startCmd}"`)
    }
    log(`started child on ${baseUrl} with timeout ${currentTimeoutMs}`)
  }

  const replayInputs = async (texts: string[]) => {
    if (texts.length === 0) {
      log('no replay inputs found')
      return
    }
    await withTimeout(
      waitForStatus({ baseUrl, token, timeoutMs: 30000 }),
      35000,
      'status check timeout',
    )
    for (const text of texts) {
      const id = await postInput({ baseUrl, token, text })
      log(`replayed input id=${id}`)
    }
  }

  const restartWithFix = async () => {
    await stopChild()
    startChild()
    await replayInputs(texts)
  }

  await ensureDir(reportDir)
  await prepareState(resetParams)
  const texts = await loadReplayTexts(sourceStateDir, replayMode, replayCount)
  startChild()
  await replayInputs(texts)

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
    onRestart: restartWithFix,
    writeReport,
    log,
  })
  const pollLog = createLogTail(logPath, handleEntry)
  const timer = setInterval(() => {
    void pollLog()
  }, pollMs)

  const shutdown = async () => {
    clearInterval(timer)
    await stopChild()
    process.exit(0)
  }

  if (runSeconds > 0) {
    setTimeout(() => {
      log(`run-seconds reached (${runSeconds}s), stopping`)
      void shutdown()
    }, runSeconds * 1000)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

run().catch((error) => {
  console.error('[debug-repro] fatal', error)
  process.exit(1)
})
