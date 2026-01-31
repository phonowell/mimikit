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
      '',
      'Options:',
      '  --work-dir <dir>  Workspace directory (default: .)',
      '  --state-dir <dir> State directory (default: .mimikit)',
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

  usage()
  process.exit(1)
}
