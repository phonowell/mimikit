import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformAsync } from '@babel/core'
import { build } from 'esbuild'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const generatedDir = resolve(rootDir, 'webui', 'generated')
const webuiSourceDir = resolve(rootDir, 'webui-src')

const resolveLoader = (path) => {
  switch (extname(path)) {
    case '.tsx':
      return 'tsx'
    case '.ts':
      return 'ts'
    case '.jsx':
      return 'jsx'
    default:
      return 'js'
  }
}

const reactCompilerPlugin = {
  name: 'react-compiler',
  setup(esbuild) {
    esbuild.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      if (!args.path.startsWith(webuiSourceDir)) return null
      const source = await readFile(args.path, 'utf8')
      const transformed = await transformAsync(source, {
        babelrc: false,
        configFile: false,
        filename: args.path,
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        plugins: ['babel-plugin-react-compiler'],
        sourceMaps: false,
      })
      return {
        contents: transformed?.code ?? source,
        loader: resolveLoader(args.path),
      }
    })
  },
}

await rm(generatedDir, { force: true, recursive: true })
await mkdir(generatedDir, { recursive: true })

await build({
  bundle: true,
  chunkNames: 'chunks/[name]-[hash]',
  entryNames: '[name]',
  entryPoints: {
    app: resolve(rootDir, 'webui-src', 'main.tsx'),
    'archive-viewer': resolve(rootDir, 'webui-src', 'archive-viewer.ts'),
  },
  format: 'esm',
  jsx: 'automatic',
  legalComments: 'none',
  minify: true,
  outdir: generatedDir,
  platform: 'browser',
  plugins: [reactCompilerPlugin],
  splitting: true,
  target: ['es2022'],
  tsconfig: resolve(rootDir, 'tsconfig.webui.json'),
})
