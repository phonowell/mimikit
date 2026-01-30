import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { searchMemory } from '../memory.js'

import { getBm25Stats } from './bm25.js'
import { readMemoryFlushState } from './flush.js'
import { readMemoryRollupState } from './rollup.js'

import { listSearchFiles } from './index.js'

const usage = () => {
  console.log(
    [
      'mimikit memory <command> [options]',
      '',
      'Commands:',
      '  status            Show memory search status',
      '  index             Build BM25 index and show counts',
      '  search <query>    Search memory',
      '',
      'Options:',
      '  --work-dir <dir>  Workspace directory (default: .)',
      '  --state-dir <dir> State directory (default: .mimikit)',
    ].join('\n'),
  )
}

const extractKeywords = (query: string): string[] => {
  const tokens: string[] = []
  const matches = query.match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi)
  if (!matches) return tokens
  for (const match of matches) tokens.push(match)
  return tokens
}

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

  if (command === 'status') {
    const files = await listSearchFiles({ workDir })
    const counts = files.reduce(
      (acc, entry) => {
        acc.total += 1
        acc[entry.kind] += 1
        return acc
      },
      {
        total: 0,
        memory: 0,
        summary: 0,
        docs: 0,
        longterm: 0,
      },
    )
    const bm25 = await getBm25Stats(workDir)
    const flush = await readMemoryFlushState(stateDir)
    const rollup = await readMemoryRollupState(stateDir)
    console.log(`files=${counts.total}`)
    console.log(
      `longterm=${counts.longterm} memory=${counts.memory} summary=${counts.summary} docs=${counts.docs}`,
    )
    console.log(`bm25.files=${bm25.fileCount} bm25.chunks=${bm25.chunkCount}`)
    if (flush.lastFlushAt) console.log(`last_flush=${flush.lastFlushAt}`)
    if (flush.lastHandoffAt) console.log(`last_handoff=${flush.lastHandoffAt}`)
    if (rollup.lastRunAt) console.log(`last_rollup=${rollup.lastRunAt}`)
    return
  }

  if (command === 'index') {
    const stats = await getBm25Stats(workDir)
    console.log(`files=${stats.fileCount} chunks=${stats.chunkCount}`)
    return
  }

  if (command === 'search') {
    const query = positionals.slice(1).join(' ').trim()
    if (!query) {
      console.error('search query required')
      process.exit(1)
    }
    const keywords = extractKeywords(query)
    if (keywords.length === 0) {
      console.error('no valid keywords extracted')
      process.exit(1)
    }
    const hits = await searchMemory(
      {
        workDir,
      },
      keywords,
    )
    if (hits.length === 0) {
      console.log('no hits')
      return
    }
    for (const hit of hits) console.log(`${hit.path}:${hit.line} ${hit.text}`)

    return
  }

  usage()
  process.exit(1)
}
