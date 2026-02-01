import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from '../config.js'

import { listMemoryFiles } from './files.js'
import { searchMemory } from './search.js'

const usage = () => {
  console.log(
    [
      'mimikit memory <command> [options]',
      '',
      'Commands:',
      '  status            Show memory search status',
      '  index             Show memory file counts',
      '  search <query>    Search memory',
      '  prune             Remove old memory files',
      '',
      'Options:',
      '  --work-dir <dir>  Workspace directory (default: .)',
      '  --state-dir <dir> State directory (default: .mimikit)',
      '  --recent-days <n> Keep recent memory days (default: 5)',
      '  --summary-days <n> Keep summary days (default: 180)',
      '  --keep-longterm   Keep memory.md (default: true)',
      '  --dry-run         Show what would be removed',
    ].join('\n'),
  )
}

const extractQuery = (parts: string[]): string => parts.join(' ').trim()

export const runMemoryCli = async (argv: string[]): Promise<void> => {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'work-dir': { type: 'string', default: '.' },
      'state-dir': { type: 'string', default: '.mimikit' },
      'recent-days': { type: 'string', default: '5' },
      'summary-days': { type: 'string', default: '180' },
      'keep-longterm': { type: 'boolean', default: true },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const command = positionals[0]
  if (!command) {
    usage()
    process.exit(1)
  }

  const workDir = resolve(values['work-dir'])
  const stateDir = resolve(values['state-dir'])

  if (command === 'status' || command === 'index') {
    const files = await listMemoryFiles({ stateDir })
    const counts = files.reduce(
      (acc, entry) => {
        acc.total += 1
        acc[entry.kind] += 1
        return acc
      },
      { total: 0, memory: 0, summary: 0, longterm: 0 },
    )
    console.log(`files=${counts.total}`)
    console.log(
      `longterm=${counts.longterm} memory=${counts.memory} summary=${counts.summary}`,
    )
    return
  }

  if (command === 'search') {
    const query = extractQuery(positionals.slice(1))
    if (!query) {
      console.error('search query required')
      process.exit(1)
    }
    const config = defaultConfig({ stateDir, workDir })
    const hits = await searchMemory({
      stateDir,
      query,
      limit: config.memorySearch.maxHits,
      k1: config.memorySearch.bm25K1,
      b: config.memorySearch.bm25B,
      minScore: config.memorySearch.minScore,
    })
    if (hits.length === 0) {
      console.log('no hits')
      return
    }
    for (const hit of hits) {
      const snippet = hit.content.replace(/\s+/g, ' ').trim()
      console.log(`${hit.source} (${hit.score.toFixed(2)}): ${snippet}`)
    }
    return
  }

  if (command === 'prune') {
    const { pruneMemory } = await import('./prune.js')
    const recentRaw = Number(values['recent-days'])
    const summaryRaw = Number(values['summary-days'])
    const recentDays = Number.isFinite(recentRaw) ? Math.max(0, recentRaw) : 5
    const summaryDays = Number.isFinite(summaryRaw)
      ? Math.max(0, summaryRaw)
      : 180
    const keepLongTerm = values['keep-longterm'] !== false
    const dryRun = values['dry-run'] === true
    const result = await pruneMemory({
      stateDir,
      policy: {
        recentDays,
        summaryDays,
        keepLongTerm,
      },
      dryRun,
    })
    for (const path of result.removed)
      console.log(`${dryRun ? 'would remove' : 'removed'}: ${path}`)

    if (result.removed.length === 0) console.log('nothing to remove')
    return
  }

  usage()
  process.exit(1)
}
