import {
  ignoreConfig,
  srcTsLanguageOptions,
  tasksTsLanguageOptions,
  typeScriptPlugins,
  webuiJsLanguageOptions,
  webuiTsLanguageOptions,
} from './shared.mjs'
import { tasksTsRules, webuiJsRules } from './rules-other.mjs'
import { srcTsRules, webuiSrcTsRules } from './rules-ts.mjs'

export const configBlocks = [
  ignoreConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions: srcTsLanguageOptions,
    plugins: typeScriptPlugins,
    rules: srcTsRules,
  },
  {
    files: ['webui-src/**/*.{ts,tsx}'],
    languageOptions: webuiTsLanguageOptions,
    plugins: typeScriptPlugins,
    rules: webuiSrcTsRules,
  },
  {
    files: ['webui/**/*.js'],
    ignores: ['webui/generated/**/*.js'],
    languageOptions: webuiJsLanguageOptions,
    rules: webuiJsRules,
  },
  {
    files: ['tasks/**/*.ts'],
    languageOptions: tasksTsLanguageOptions,
    plugins: typeScriptPlugins,
    rules: tasksTsRules,
  },
]
