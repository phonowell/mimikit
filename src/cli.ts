import { parseAskArgs } from './cli/args.js'
import { loadConfig, type ResumePolicy } from './config.js'
import { loadTaskLedger } from './runtime/ledger.js'
import { Master } from './runtime/master.js'
import { startHttpServer } from './server/http.js'

const printUsage = (): void => {
  console.log(`Usage:
  tsx src/cli.ts serve [--port <port>]
  tsx src/cli.ts ask [--session <key>] [--message <text>] [text...] [--resume auto|always|never] [--verify "<cmd>"] [--score "<cmd>"] [--min-score <n>] [--objective "<text>"] [--max-iterations <n>] [--guard-clean] [--guard-max-files <n>] [--guard-max-lines <n>]
  tsx src/cli.ts task --id <taskId>
  tsx src/cli.ts stats
  pnpm ask "message..."
`)
}

const getArgValue = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

const runServe = async (args: string[]): Promise<void> => {
  const portValue = getArgValue(args, '--port')
  const port = portValue ? Number(portValue) : 8787
  if (!Number.isFinite(port)) throw new Error('Invalid port')

  const config = await loadConfig()
  const master = await Master.create(config)
  await startHttpServer({ port, master })
  console.log(`HTTP server listening on ${port}`)
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
  const {
    scoreCommand,
    minScore,
    objective,
    guardRequireClean,
    guardMaxChangedFiles,
    guardMaxChangedLines,
  } = parsed.value
  const config = await loadConfig()
  const master = await Master.create(config)
  const request: {
    sessionKey: string
    prompt: string
    resume?: ResumePolicy
    verifyCommand?: string
    scoreCommand?: string
    minScore?: number
    objective?: string
    maxIterations?: number
    guardRequireClean?: boolean
    guardMaxChangedFiles?: number
    guardMaxChangedLines?: number
  } = {
    sessionKey,
    prompt: message,
  }
  if (resume !== undefined) request.resume = resume
  if (verifyCommand !== undefined) request.verifyCommand = verifyCommand
  if (scoreCommand !== undefined) request.scoreCommand = scoreCommand
  if (minScore !== undefined) request.minScore = minScore
  if (objective !== undefined) request.objective = objective
  if (maxIterations !== undefined) request.maxIterations = maxIterations
  if (guardRequireClean !== undefined)
    request.guardRequireClean = guardRequireClean
  if (guardMaxChangedFiles !== undefined)
    request.guardMaxChangedFiles = guardMaxChangedFiles
  if (guardMaxChangedLines !== undefined)
    request.guardMaxChangedLines = guardMaxChangedLines

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

const runStats = async (): Promise<void> => {
  const config = await loadConfig()
  const master = await Master.create(config)
  const stats = await master.getMetricsSummary()
  console.log(JSON.stringify(stats, null, 2))
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
      await runServe(args)
      return
    case 'ask':
      await runAsk(args)
      return
    case 'task':
      await runTask(args)
      return
    case 'stats':
      await runStats()
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
