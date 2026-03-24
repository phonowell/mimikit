import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import unusedImports from 'eslint-plugin-unused-imports'

export const ignoreConfig = {
  ignores: [
    'src/__generated__',
    'webui/generated/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/*.min.js',
  ],
}

export const typeScriptPlugins = {
  '@typescript-eslint': tsPlugin,
  import: importPlugin,
  prettier: prettierPlugin,
  'unused-imports': unusedImports,
}

export const srcTsLanguageOptions = {
  ecmaVersion: 'latest',
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  parser: tsParser,
  parserOptions: {
    project: true,
  },
  sourceType: 'module',
}

export const webuiTsLanguageOptions = {
  ecmaVersion: 'latest',
  globals: {
    ...globals.browser,
  },
  parser: tsParser,
  parserOptions: {
    project: './tsconfig.webui.json',
  },
  sourceType: 'module',
}

export const webuiJsLanguageOptions = {
  ecmaVersion: 'latest',
  globals: {
    ...globals.browser,
  },
  sourceType: 'module',
}

export const tasksTsLanguageOptions = {
  ecmaVersion: 'latest',
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  parser: tsParser,
  parserOptions: {},
  sourceType: 'module',
}
