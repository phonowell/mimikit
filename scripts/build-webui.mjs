import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const generatedDir = resolve(rootDir, 'webui', 'generated')

await mkdir(generatedDir, { recursive: true })

const entryPoints = [
  {
    entryPoint: resolve(rootDir, 'webui-src', 'main.tsx'),
    outfile: resolve(generatedDir, 'app.js'),
  },
  {
    entryPoint: resolve(rootDir, 'webui-src', 'archive-viewer.ts'),
    outfile: resolve(generatedDir, 'archive-viewer.js'),
  },
]

for (const { entryPoint, outfile } of entryPoints) {
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
}
