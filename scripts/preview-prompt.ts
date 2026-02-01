import {
  buildPlannerPrompt,
  buildTellerPrompt,
  buildWorkerPrompt,
  type PromptMode,
} from '../src/roles/prompt.js'

const usage = () => {
  console.log(
    'Usage: pnpm prompt:preview <teller|planner|worker> [--mode full|minimal|none] ["input"...]',
  )
  console.log('  teller: each extra arg becomes one user input line')
  console.log('  planner/worker: extra args are joined with spaces')
}

const parseMode = (value?: string): PromptMode | undefined => {
  if (!value) return undefined
  if (value === 'full' || value === 'minimal' || value === 'none') return value
  return undefined
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage()
    process.exit(argv.length ? 0 : 1)
  }

  let role: string | undefined
  let mode: PromptMode | undefined
  const args: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!role && !arg.startsWith('-')) {
      role = arg
      continue
    }
    if (arg === '--mode' || arg === '-m') {
      mode = parseMode(argv[i + 1])
      i += 1
      if (!mode) {
        console.error('Invalid --mode. Use full, minimal, or none.')
        usage()
        process.exit(1)
      }
      continue
    }
    args.push(arg)
  }

  if (!role) {
    usage()
    process.exit(1)
  }

  const workDir = process.cwd()

  switch (role) {
    case 'teller': {
      const prompt = await buildTellerPrompt({
        workDir,
        history: [],
        memory: [],
        inputs: args,
        events: [],
        promptMode: mode,
      })
      console.log(prompt)
      return
    }
    case 'planner': {
      const prompt = await buildPlannerPrompt({
        workDir,
        history: [],
        memory: [],
        request: args.join(' '),
        promptMode: mode,
      })
      console.log(prompt)
      return
    }
    case 'worker': {
      const prompt = await buildWorkerPrompt({
        workDir,
        taskPrompt: args.join(' '),
        promptMode: mode,
      })
      console.log(prompt)
      return
    }
    default: {
      console.error(`Unknown role: ${role}`)
      usage()
      process.exit(1)
    }
  }
}

main()
