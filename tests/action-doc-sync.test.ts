import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { ACTION_DEFINITIONS } from '../src/manager/action-registry-definitions.js'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ACTION_DOC_PATH = resolve(ROOT_DIR, 'docs/design/workflow/action.md')

const MANAGER_ACTION_LIST_START = '### 读取与检索'
const MANAGER_ACTION_LIST_END = '## 动态 Action Surface'

const extractManagerActionNamesFromDoc = (source: string): string[] => {
  const startIndex = source.indexOf(MANAGER_ACTION_LIST_START)
  const endIndex = source.indexOf(MANAGER_ACTION_LIST_END)
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error('[action-doc-sync] failed to locate manager action list block')
  }

  const listBlock = source.slice(startIndex, endIndex)
  const matches = [...listBlock.matchAll(/^- `([a-z_]+)`$/gm)]
  return matches.map((match) => match[1])
}

test('action doc manager action list matches registry definitions', () => {
  const source = readFileSync(ACTION_DOC_PATH, 'utf8')
  const docNames = extractManagerActionNamesFromDoc(source)
  const uniqueDocNames = [...new Set(docNames)]

  expect(uniqueDocNames).toHaveLength(docNames.length)

  const sortedDocNames = [...uniqueDocNames].sort()
  const sortedRegistryNames = ACTION_DEFINITIONS.map(
    (definition) => definition.name,
  ).sort()

  expect(sortedDocNames).toEqual(sortedRegistryNames)
})
