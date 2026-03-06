import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICON_NAMES = [
  'arrow-down',
  'ellipsis',
  'eraser',
  'message-square-quote',
  'message-square-x',
  'pause',
  'play',
  'rotate-ccw',
  'send-horizontal',
  'square',
  'trash-2',
  'x',
]

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const lucideIconsDir = resolve(repoRoot, 'node_modules/lucide-static/icons')
const outputPath = resolve(repoRoot, 'webui/icons/sprite.svg')

const parseIconSvg = (iconName) => {
  const sourcePath = resolve(lucideIconsDir, `${iconName}.svg`)
  const source = readFileSync(sourcePath, 'utf8')
  const matched = source.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i)
  if (!matched) throw new Error(`invalid icon svg: ${sourcePath}`)

  const attrs =
    matched[1]
      ?.replace(/\sxmlns=(['"]).*?\1/g, '')
      ?.replace(/\sclass=(['"]).*?\1/g, '')
      ?.replace(/\swidth=(['"]).*?\1/g, '')
      ?.replace(/\sheight=(['"]).*?\1/g, '')
      ?.replace(/\s+/g, ' ')
      ?.trim() ?? ''
  const body = matched[2]?.trim() ?? ''
  const symbolAttrs = attrs.length > 0 ? ` ${attrs}` : ''
  return `  <symbol id="icon-${iconName}"${symbolAttrs}>${body}</symbol>`
}

const symbols = ICON_NAMES.map(parseIconSvg)
const sprite = ['<svg xmlns="http://www.w3.org/2000/svg">', ...symbols, '</svg>', ''].join('\n')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, sprite, 'utf8')
console.log(`[icons] wrote ${outputPath}`)
