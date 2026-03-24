import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const entryPoint = resolve(rootDir, 'webui-src', 'main.tsx')
const outfile = resolve(rootDir, 'webui', 'generated', 'app.js')

await mkdir(dirname(outfile), { recursive: true })

await build({
  bundle: true,
  entryPoints: [entryPoint],
  format: 'esm',
  jsx: 'automatic',
  legalComments: 'none',
  outfile,
  platform: 'browser',
  target: ['es2022'],
  tsconfig: resolve(rootDir, 'tsconfig.webui.json'),
})
