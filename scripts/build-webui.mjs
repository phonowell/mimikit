import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformAsync } from '@babel/core'
import { build } from 'esbuild'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const generatedDir = resolve(rootDir, 'webui', 'generated')
const generatedBuildPrefix = resolve(rootDir, 'webui', '.generated-build-')
const generatedBackupDir = resolve(rootDir, 'webui', '.generated-prev')
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

const nextGeneratedDir = await mkdtemp(generatedBuildPrefix)

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
  outdir: nextGeneratedDir,
  platform: 'browser',
  plugins: [reactCompilerPlugin],
  splitting: true,
  target: ['es2022'],
  tsconfig: resolve(rootDir, 'tsconfig.webui.json'),
})

await rm(generatedBackupDir, { force: true, recursive: true })
await rename(generatedDir, generatedBackupDir).catch(async (error) => {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'ENOENT') return
  await rm(nextGeneratedDir, { force: true, recursive: true })
  throw error
})

try {
  await rename(nextGeneratedDir, generatedDir)
} catch (error) {
  await rm(nextGeneratedDir, { force: true, recursive: true })
  await rename(generatedBackupDir, generatedDir).catch(() => {})
  throw error
}

await rm(generatedBackupDir, { force: true, recursive: true })
