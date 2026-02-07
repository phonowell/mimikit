import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { expect, test } from 'vitest'

type Graph = Map<string, Set<string>>

type ImportEdge = {
  from: string
  to: string
  specifier: string
}

const srcRoot = resolve(process.cwd(), 'src')

const toPosix = (pathValue: string): string => pathValue.replaceAll('\\', '/')

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) {
      files.push(...collectSourceFiles(abs))
      continue
    }
    if (abs.endsWith('.ts') || abs.endsWith('.js')) files.push(abs)
  }
  return files
}

const parseRelativeImportSpecifiers = (content: string): string[] => {
  const patterns = [
    /(?:import|export)\s+[^'"\n]+?\s+from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ]
  const specifiers = new Set<string>()
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(content)
    while (match) {
      const specifier = match[1]
      if (specifier?.startsWith('.')) specifiers.add(specifier)
      match = pattern.exec(content)
    }
  }
  return [...specifiers]
}

const resolveImportTarget = (fromAbs: string, specifier: string): string | null => {
  const base = resolve(dirname(fromAbs), specifier)
  const candidates: string[] = []
  const pushCandidate = (pathValue: string) => {
    if (!candidates.includes(pathValue)) candidates.push(pathValue)
  }

  pushCandidate(base)
  if (base.endsWith('.js')) pushCandidate(base.slice(0, -3) + '.ts')
  if (base.endsWith('.ts')) pushCandidate(base.slice(0, -3) + '.js')
  pushCandidate(`${base}.ts`)
  pushCandidate(`${base}.js`)
  pushCandidate(join(base, 'index.ts'))
  pushCandidate(join(base, 'index.js'))

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return toPosix(relative(srcRoot, candidate))
    } catch {
      continue
    }
  }
  return null
}

const buildImportGraph = (): { graph: Graph; edges: ImportEdge[] } => {
  const absFiles = collectSourceFiles(srcRoot)
  const relFiles = absFiles.map((file) => toPosix(relative(srcRoot, file)))
  const graph: Graph = new Map(relFiles.map((file) => [file, new Set<string>()]))
  const edges: ImportEdge[] = []

  for (const absFile of absFiles) {
    const from = toPosix(relative(srcRoot, absFile))
    const content = readFileSync(absFile, 'utf8')
    const specifiers = parseRelativeImportSpecifiers(content)
    for (const specifier of specifiers) {
      const target = resolveImportTarget(absFile, specifier)
      if (!target || !graph.has(target) || target === from) continue
      graph.get(from)?.add(target)
      edges.push({ from, to: target, specifier })
    }
  }

  return { graph, edges }
}

const findCycles = (graph: Graph): string[][] => {
  let nextIndex = 0
  const stack: string[] = []
  const inStack = new Set<string>()
  const indexByNode = new Map<string, number>()
  const lowLinkByNode = new Map<string, number>()
  const cycles: string[][] = []

  const visit = (node: string): void => {
    indexByNode.set(node, nextIndex)
    lowLinkByNode.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    inStack.add(node)

    const neighbors = graph.get(node)
    if (neighbors) {
      for (const next of neighbors) {
        if (!indexByNode.has(next)) {
          visit(next)
          lowLinkByNode.set(
            node,
            Math.min(lowLinkByNode.get(node) ?? 0, lowLinkByNode.get(next) ?? 0),
          )
          continue
        }
        if (!inStack.has(next)) continue
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node) ?? 0, indexByNode.get(next) ?? 0),
        )
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) return
    const component: string[] = []
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) break
      inStack.delete(current)
      component.push(current)
      if (current === node) break
    }
    if (component.length > 1) cycles.push(component.sort())
  }

  for (const node of graph.keys()) {
    if (!indexByNode.has(node)) visit(node)
  }

  return cycles.sort((a, b) => a.join('|').localeCompare(b.join('|')))
}

const topLevelOf = (relativePath: string): string => {
  const [head] = relativePath.split('/')
  return head ?? relativePath
}

const forbiddenBySource = new Map<string, Set<string>>([
  ['http', new Set(['evolve'])],
  ['log', new Set(['fs'])],
  ['fs', new Set(['supervisor', 'http', 'roles', 'evolve', 'llm', 'tasks'])],
])

const findForbiddenEdges = (edges: ImportEdge[]): ImportEdge[] =>
  edges.filter((edge) => {
    const fromTop = topLevelOf(edge.from)
    const toTop = topLevelOf(edge.to)
    if (fromTop === toTop) return false
    return forbiddenBySource.get(fromTop)?.has(toTop) ?? false
  })

test('src modules have no file-level dependency cycles', () => {
  const { graph } = buildImportGraph()
  const cycles = findCycles(graph)
  expect(cycles).toEqual([])
})

test('src modules respect key boundary constraints', () => {
  const { edges } = buildImportGraph()
  const forbiddenEdges = findForbiddenEdges(edges)
  const summary = forbiddenEdges.map(
    ({ from, to, specifier }) => `${from} -> ${to} (${specifier})`,
  )
  expect(summary).toEqual([])
})
