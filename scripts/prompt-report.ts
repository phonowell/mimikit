import { buildManagerPrompt, buildWorkerPrompt } from '../src/roles/prompt.js'

type Role = 'manager' | 'worker'

type PromptReport = {
  role: Role
  totalChars: number
}

const usage = () => {
  console.log(
    'Usage: pnpm prompt:report <manager|worker|all> [--json] ["input"...]',
  )
  console.log('  manager: each extra arg becomes one user input line')
  console.log('  worker: extra args are joined as the task prompt')
}

const buildReport = async (params: {
  role: Role
  workDir: string
  args: string[]
}): Promise<PromptReport> => {
  let prompt = ''
  if (params.role === 'manager') {
    prompt = await buildManagerPrompt({
      workDir: params.workDir,
      inputs: params.args,
      results: [],
      tasks: [],
      history: [],
    })
  }
  if (params.role === 'worker') {
    prompt = await buildWorkerPrompt({
      workDir: params.workDir,
      task: {
        id: 'task-1',
        prompt: params.args.join(' '),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    })
  }
  return { role: params.role, totalChars: prompt.length }
}

const printReport = (report: PromptReport) => {
  console.log(`role: ${report.role}`)
  console.log(`total chars: ${report.totalChars}`)
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage()
    process.exit(argv.length ? 0 : 1)
  }

  let role: Role | 'all' | undefined
  let json = false
  const args: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!role && !arg.startsWith('-')) {
      role = arg as Role | 'all'
      continue
    }
    if (arg === '--json' || arg === '-j') {
      json = true
      continue
    }
    args.push(arg)
  }

  if (!role) {
    usage()
    process.exit(1)
  }

  const workDir = process.cwd()
  const allowedRoles: Role[] = ['manager', 'worker']
  if (role !== 'all' && !allowedRoles.includes(role as Role)) {
    console.error(`Unknown role: ${role}`)
    usage()
    process.exit(1)
  }

  const roles: Role[] = role === 'all' ? allowedRoles : [role]
  const reports = [] as PromptReport[]
  for (const item of roles) {
    reports.push(
      await buildReport({
        role: item,
        workDir,
        args,
      }),
    )
  }

  if (json) {
    console.log(JSON.stringify(role === 'all' ? { reports } : reports[0], null, 2))
    return
  }

  reports.forEach((report, index) => {
    if (index > 0) console.log('')
    printReport(report)
  })
}

main()
