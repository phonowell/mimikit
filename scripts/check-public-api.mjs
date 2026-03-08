import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()
const distDir = resolve(repoRoot, 'dist/channels')
const baselinePath = resolve(repoRoot, 'docs/contracts/public-api-exports.txt')

const readExports = () => {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  const exportKeys = Object.keys(pkg.exports || {})
    .filter((key) => key.startsWith('./channels/'))
    .sort()

  const dts = readdirSync(distDir)
    .filter((name) => name.endsWith('.d.ts'))
    .map((name) => name.replace(/\.d\.ts$/, ''))
    .sort()

  return {
    exportKeys,
    dts,
  }
}

const format = ({ exportKeys, dts }) => {
  const lines = [
    '# Public API baseline',
    '',
    '[package-exports]',
    ...exportKeys,
    '',
    '[dist-dts]',
    ...dts,
    '',
  ]
  return lines.join('\n')
}

const current = format(readExports())
const baseline = readFileSync(baselinePath, 'utf8')

if (current !== baseline) {
  console.error('public API drift detected')
  console.error('expected baseline file:', baselinePath)
  process.exit(1)
}

console.log('public API baseline check passed')
