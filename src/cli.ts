import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { parseAskArgs } from './cli/args.js'
import { loadConfig, type ResumePolicy } from './config.js'
import { compactTaskLedger, loadTaskLedger } from './runtime/ledger.js'
import { Master } from './runtime/master.js'
import { type RestartRequest, startHttpServer } from './server/http.js'

const printUsage = (): void => {
  console.log(`Usage:
  tsx src/cli.ts serve [--port <port>]
  tsx src/cli.ts serve [--port <port>] [--supervise]
  tsx src/cli.ts ask [--session <key>] [--message <text>] [text...] [--resume auto|always|never] [--verify "<cmd>"] [--max-iterations <n>]
  tsx src/cli.ts task --id <taskId>
  tsx src/cli.ts compact-tasks [--force]
  pnpm ask "message..."
`)
}

const getArgValue = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

const hasFlag = (args: string[], flag: string): boolean => args.includes(flag)

const stripArgs = (
  args: string[],
  flagsWithValue: string[],
  flagsWithoutValue: string[],
): string[] => {
  const stripped: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg) continue
    if (flagsWithoutValue.includes(arg)) continue
    if (flagsWithValue.includes(arg)) {
      i += 1
      continue
    }
    stripped.push(arg)
  }
  return stripped
}

const parseNumberArg = (
  args: string[],
  flag: string,
  fallback: number,
): number => {
  const value = getArgValue(args, flag)
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseEnvNumber = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

const RESTART_EXIT_CODE = 75

const resolveTsxBin = (workspaceRoot: string): string => {
  const local = path.join(workspaceRoot, 'node_modules', '.bin', 'tsx')
  if (fs.existsSync(local)) return local
  return 'tsx'
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const requestRestart = (request: RestartRequest): void => {
  const code = parseEnvNumber(
    process.env.MIMIKIT_RESTART_EXIT_CODE,
    RESTART_EXIT_CODE,
  )
  const supervised = process.env.MIMIKIT_SUPERVISED === '1'
  const reason = request.reason ? ` reason=${request.reason}` : ''
  const force = request.force ? ' force=true' : ''
  const detail = `${request.source}${reason}${force}`
  if (!supervised)
    console.error(`Restart requested without supervisor (${detail})`)
  else console.error(`Restart requested (${detail})`)

  setTimeout(() => {
    process.exit(code)
  }, 50)
}

const runServe = async (args: string[]): Promise<void> => {
  const portValue = getArgValue(args, '--port')
  const port = portValue ? Number(portValue) : 8787
  if (!Number.isFinite(port)) throw new Error('Invalid port')

  const config = await loadConfig()
  const master = await Master.create(config)
  await startHttpServer({ port, master, onRestart: requestRestart })
  console.log(`HTTP server listening on ${port}`)
}

const runServeSupervisor = async (args: string[]): Promise<void> => {
  const delayMs = Math.max(
    0,
    parseNumberArg(
      args,
      '--supervise-delay',
      parseEnvNumber(process.env.MIMIKIT_SUPERVISE_DELAY_MS, 2000),
    ),
  )
  const maxRestarts = Math.max(
    0,
    parseNumberArg(
      args,
      '--supervise-max',
      parseEnvNumber(process.env.MIMIKIT_SUPERVISE_MAX_RESTARTS, 0),
    ),
  )

  const filteredArgs = stripArgs(
    args,
    ['--supervise-delay', '--supervise-max'],
    ['--supervise', '--child'],
  )
  const tsxBin = resolveTsxBin(process.cwd())
  let restarts = 0
  let child: ReturnType<typeof spawn> | null = null

  const stop = (): void => {
    if (child && !child.killed) child.kill('SIGTERM')
    process.exit(0)
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  for (;;) {
    const spawned = spawn(
      tsxBin,
      ['src/cli.ts', 'serve', '--child', ...filteredArgs],
      {
        stdio: 'inherit',
        env: { ...process.env, MIMIKIT_SUPERVISED: '1' },
      },
    )
    child = spawned

    const exitCode = await new Promise<number>((resolve) => {
      spawned.once('exit', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0))
      })
    })
    if (exitCode === 0) return

    restarts += 1
    if (maxRestarts > 0 && restarts > maxRestarts) {
      console.error('Supervisor max restarts exceeded')
      process.exitCode = 1
      return
    }
    const suffix = exitCode === 0 ? 'clean exit' : `code ${exitCode}`
    console.error(`Supervisor restarting (${suffix})`)
    if (delayMs > 0) {
      const backoffFactor = Math.min(8, 2 ** Math.max(0, restarts - 1))
      await sleep(delayMs * backoffFactor)
    }
  }
}

const waitForTask = async (
  master: Master,
  taskId: string,
  timeoutMs: number,
): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const task = master.getTask(taskId)
    if (!task) throw new Error('Task not found')
    if (task.status === 'done') {
      if (task.result) console.log(task.result)
      return
    }
    if (task.status === 'failed') {
      if (task.result) console.error(task.result)
      process.exitCode = 1
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Timed out waiting for task')
}

const runAsk = async (args: string[]): Promise<void> => {
  const parsed = parseAskArgs(args)
  if (!parsed.ok) throw new Error(parsed.error)

  const { sessionKey, message, resume, verifyCommand, maxIterations } =
    parsed.value
  const config = await loadConfig()
  const master = await Master.create(config)
  const request: {
    sessionKey: string
    prompt: string
    resume?: ResumePolicy
    verifyCommand?: string
    maxIterations?: number
  } = {
    sessionKey,
    prompt: message,
  }
  if (resume !== undefined) request.resume = resume
  if (verifyCommand !== undefined) request.verifyCommand = verifyCommand
  if (maxIterations !== undefined) request.maxIterations = maxIterations

  const task = await master.enqueueTask(request)
  await waitForTask(master, task.id, config.timeoutMs + 30_000)
}

const runTask = async (args: string[]): Promise<void> => {
  const id = getArgValue(args, '--id')
  if (!id) throw new Error('--id is required')

  const config = await loadConfig()
  const tasks = await loadTaskLedger(config.stateDir)
  const task = tasks.get(id)
  if (!task) {
    console.error('Task not found')
    process.exitCode = 1
    return
  }

  console.log(JSON.stringify(task, null, 2))
}

const runCompactTasks = async (args: string[]): Promise<void> => {
  const force = args.includes('--force')
  const config = await loadConfig()
  const tasks = await loadTaskLedger(config.stateDir)
  const hasActive = Array.from(tasks.values()).some(
    (task) => task.status === 'queued' || task.status === 'running',
  )
  if (hasActive && !force) {
    console.error('Active tasks detected; stop the server or pass --force.')
    process.exitCode = 1
    return
  }

  const result = await compactTaskLedger(config.stateDir)
  console.log(JSON.stringify(result, null, 2))
}

const main = async (): Promise<void> => {
  const [command, ...args] = process.argv.slice(2)
  if (
    !command ||
    command === '--help' ||
    command === '-h' ||
    command === 'help'
  ) {
    printUsage()
    return
  }

  switch (command) {
    case 'serve':
      if (
        parseBooleanEnv(process.env.MIMIKIT_SUPERVISE) &&
        process.env.MIMIKIT_SUPERVISED !== '1'
      ) {
        await runServeSupervisor(args)
        return
      }
      if (
        hasFlag(args, '--supervise') &&
        process.env.MIMIKIT_SUPERVISED !== '1'
      ) {
        await runServeSupervisor(args)
        return
      }
      await runServe(args)
      return
    case 'ask':
      await runAsk(args)
      return
    case 'task':
      await runTask(args)
      return
    case 'compact-tasks':
      await runCompactTasks(args)
      return
    default:
      printUsage()
      process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
