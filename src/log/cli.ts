import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { buildPaths } from '../fs/paths.js'

import { readRunLog } from './run-log.js'

const usage = () => {
  console.log(
    [
      'mimikit runs --kind <task|trigger> --id <id> [options]',
      '',
      'Options:',
      '  --limit <n>       Max entries (default: 200)',
      '  --state-dir <dir> State directory (default: .mimikit)',
    ].join('\n'),
  )
}

export const runRunsCli = async (argv: string[]): Promise<void> => {
  const { values } = parseArgs({
    args: argv,
    options: {
      kind: { type: 'string' },
      id: { type: 'string' },
      limit: { type: 'string', default: '200' },
      'state-dir': { type: 'string', default: '.mimikit' },
    },
  })

  const kind = values.kind?.trim()
  const id = values.id?.trim()
  if (!kind || !id || (kind !== 'task' && kind !== 'trigger')) {
    usage()
    process.exit(1)
  }
  const limitRaw = Number(values.limit)
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(5000, Math.floor(limitRaw)))
    : 200
  const stateDir = resolve(values['state-dir'])
  const paths = buildPaths(stateDir)
  const dir = kind === 'task' ? paths.taskRuns : paths.triggerRuns
  const entries = await readRunLog(dir, id, { limit })
  if (entries.length === 0) {
    console.log('no entries')
    return
  }
  for (const entry of entries) console.log(JSON.stringify(entry))
}
