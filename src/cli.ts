import { loadConfig } from './config.js'
import { compactTaskLedger, loadTaskLedger } from './runtime/ledger.js'
import { Master } from './runtime/master.js'
import { startHttpServer } from './server/http.js'

const printUsage = (): void => {
  console.log(`Usage:
  tsx src/cli.ts serve [--port <port>]
  tsx src/cli.ts task --id <taskId>
  tsx src/cli.ts compact-tasks [--force]
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
      await runServe(args)
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
