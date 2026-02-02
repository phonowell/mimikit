import {
  buildTellerPrompt,
  buildThinkerPrompt,
  buildWorkerPrompt,
} from '../src/roles/prompt.js'

const usage = () => {
  console.log(
    'Usage: pnpm prompt:preview <teller|thinker|worker> ["input"...]',
  )
  console.log('  teller: each extra arg becomes one user input line')
  console.log('  thinker: extra args become user inputs')
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
    case 'teller': {
      const prompt = await buildTellerPrompt({
        workDir,
        inputs: args,
        notices: [],
      })
      console.log(prompt)
      return
    }
    case 'thinker': {
      const prompt = await buildThinkerPrompt({
        workDir,
        state: { sessionId: '', lastWakeAt: '', notes: '' },
        inputs: args.map((text, idx) => ({
          id: String(idx + 1),
          text,
          createdAt: new Date().toISOString(),
          processedByThinker: false,
        })),
        results: [],
        tasks: [],
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
          priority: 5,
          status: 'queued',
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
