import { buildManagerPrompt, buildWorkerPrompt } from '../src/roles/prompt.js'

const usage = () => {
  console.log(
    'Usage: pnpm prompt:preview <manager|worker> ["input"...]',
  )
  console.log('  manager: each extra arg becomes one user input line')
  console.log('  worker: extra args are joined as the task prompt')
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage()
    process.exit(argv.length ? 0 : 1)
  }

  const role = argv[0]
  const args = argv.slice(1)
  const workDir = process.cwd()

  switch (role) {
    case 'manager': {
      const prompt = await buildManagerPrompt({
        workDir,
        inputs: args,
        results: [],
        tasks: [],
        history: [],
      })
      console.log(prompt)
      return
    }
    case 'worker': {
      const prompt = await buildWorkerPrompt({
        workDir,
        task: {
          id: 'task-1',
          prompt: args.join(' '),
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
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
