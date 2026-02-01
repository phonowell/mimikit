import {
  buildPlannerPromptSections,
  buildTellerPromptSections,
  buildWorkerPromptSections,
  renderPromptSections,
  type PromptMode,
  type PromptSection,
} from '../src/roles/prompt.js'

type Role = 'teller' | 'planner' | 'worker'

type SectionReport = {
  tag: string
  contentChars: number
  wrappedChars: number
}

type PromptReport = {
  role: Role
  mode: PromptMode
  totalChars: number
  separatorChars: number
  sections: SectionReport[]
}

const usage = () => {
  console.log(
    'Usage: pnpm prompt:report <teller|planner|worker|all> [--mode full|minimal|none] [--json] ["input"...]',
  )
  console.log('  teller: each extra arg becomes one user input line')
  console.log('  planner/worker: extra args are joined with spaces')
}

const parseMode = (value?: string): PromptMode | undefined => {
  if (!value) return undefined
  if (value === 'full' || value === 'minimal' || value === 'none') return value
  return undefined
}

const wrapTag = (section: PromptSection): string =>
  `<${section.tag}>\n${section.content}\n</${section.tag}>`

const buildReport = async (params: {
  role: Role
  workDir: string
  args: string[]
  mode?: PromptMode
}): Promise<PromptReport> => {
  let sections: PromptSection[] = []
  if (params.role === 'teller') {
    sections = await buildTellerPromptSections({
      workDir: params.workDir,
      history: [],
      memory: [],
      inputs: params.args,
      events: [],
      promptMode: params.mode,
    })
  }
  if (params.role === 'planner') {
    sections = await buildPlannerPromptSections({
      workDir: params.workDir,
      history: [],
      memory: [],
      request: params.args.join(' '),
      promptMode: params.mode,
    })
  }
  if (params.role === 'worker') {
    sections = await buildWorkerPromptSections({
      workDir: params.workDir,
      taskPrompt: params.args.join(' '),
      promptMode: params.mode,
    })
  }

  const rendered = renderPromptSections(sections)
  const totalChars = rendered.length
  const separatorChars = Math.max(0, sections.length - 1) * 2

  const reports = sections.map((section) => ({
    tag: section.tag,
    contentChars: section.content.length,
    wrappedChars: wrapTag(section).length,
  }))

  return {
    role: params.role,
    mode: params.mode ?? 'full',
    totalChars,
    separatorChars,
    sections: reports,
  }
}

const printReport = (report: PromptReport) => {
  console.log(`role: ${report.role}`)
  console.log(`mode: ${report.mode}`)
  console.log(`total chars: ${report.totalChars}`)
  console.log(`separator chars: ${report.separatorChars}`)
  console.log('sections:')
  report.sections.forEach((section) => {
    console.log(
      `- ${section.tag}: ${section.wrappedChars} (content ${section.contentChars})`,
    )
  })
}

const main = async () => {
  const argv = process.argv.slice(2)
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage()
    process.exit(argv.length ? 0 : 1)
  }

  let role: Role | 'all' | undefined
  let mode: PromptMode | undefined
  let json = false
  const args: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!role && !arg.startsWith('-')) {
      role = arg as Role | 'all'
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
  const allowedRoles: Role[] = ['teller', 'planner', 'worker']
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
        mode,
      }),
    )
  }

  if (json) {
    const payload = role === 'all' ? { mode: mode ?? 'full', reports } : reports[0]
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  reports.forEach((report, index) => {
    if (index > 0) console.log('')
    printReport(report)
  })
}

main()
