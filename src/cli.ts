import { loadConfig, type ResumePolicy } from './config.js'
import { loadTaskLedger } from './runtime/ledger.js'
import { Master } from './runtime/master.js'
import { startHttpServer } from './server/http.js'

const printUsage = (): void => {
  console.log(`Usage:
  tsx src/cli.ts serve [--port <port>]
  tsx src/cli.ts ask --session <key> --message <text> [--resume auto|always|never] [--verify "<cmd>"] [--max-iterations <n>]
  tsx src/cli.ts task --id <taskId>
`)
}

const getArgValue = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

const parseResumePolicy = (
  value: string | undefined,
): ResumePolicy | undefined => {
  if (!value) return undefined
  if (value === 'auto' || value === 'always' || value === 'never') return value
  return undefined
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
  const sessionKey = getArgValue(args, '--session')
  const message = getArgValue(args, '--message')
  if (!sessionKey || !message)
    throw new Error('--session and --message are required')

  const resume = parseResumePolicy(getArgValue(args, '--resume'))
  const verifyCommand = getArgValue(args, '--verify')
  const maxIterationsValue = getArgValue(args, '--max-iterations')
  let maxIterations: number | undefined
  if (maxIterationsValue !== undefined) {
    const parsed = Number(maxIterationsValue)
    if (!Number.isFinite(parsed) || parsed < 1)
      throw new Error('--max-iterations must be a positive number')
    maxIterations = Math.floor(parsed)
  }
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
    default:
      printUsage()
      process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
