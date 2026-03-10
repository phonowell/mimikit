import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()
const distDir = resolve(repoRoot, 'dist/channels')
const baselinePath = resolve(repoRoot, 'docs/contracts/public-api-exports.txt')

const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const exportKeys = Object.keys(pkg.exports || {})
  .filter((key) => key.startsWith('./channels/'))
  .sort()

const dts = readdirSync(distDir)
  .filter((name) => name.endsWith('.d.ts'))
  .map((name) => name.replace(/\.d\.ts$/, ''))
  .sort()

const content = [
  '# Public API baseline',
  '',
  '[package-exports]',
  ...exportKeys,
  '',
  '[dist-dts]',
  ...dts,
  '',
].join('\n')

writeFileSync(baselinePath, content, 'utf8')
console.log('updated', baselinePath)
