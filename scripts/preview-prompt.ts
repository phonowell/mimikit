import { defaultConfig } from '../src/bootstrap/config.js'
import { buildManagerPrompt, buildWorkerPrompt } from '../src/policy/prompts/build-prompts.js'

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
      const config = defaultConfig({ workDir })
      const prompt = await buildManagerPrompt({
        stateDir: workDir,
        workDir,
        inputs: args.map((text, index) => ({
          id: `in-${index + 1}`,
          text,
          createdAt: new Date().toISOString(),
        })),
        results: [],
        tasks: [],
        promptSectionLimits: config.manager.promptSections,
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
