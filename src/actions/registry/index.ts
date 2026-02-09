import { runBrowserSpec } from '../defs/browser/run.js'
import { editFileSpec } from '../defs/fs/edit.js'
import { patchFileSpec } from '../defs/fs/patch.js'
import { readFileSpec, writeFileSpec } from '../defs/fs/read.js'
import { searchFilesSpec } from '../defs/fs/search.js'
import { execShellSpec } from '../defs/shell/exec.js'
import { parseArgs, safeRun } from '../shared/args.js'

import type { Context, Result, Spec } from '../model/spec.js'

const INVOKABLE_SPECS = [
  readFileSpec,
  searchFilesSpec,
  writeFileSpec,
  editFileSpec,
  patchFileSpec,
  execShellSpec,
  runBrowserSpec,
] as const

export type InvokableName = (typeof INVOKABLE_SPECS)[number]['name']

const specMap = new Map(
  INVOKABLE_SPECS.map((spec) => [spec.name, spec] as const),
)

export const listInvokableActionNames = (): InvokableName[] =>
  INVOKABLE_SPECS.map((spec) => spec.name)

export const getInvokableSpec = (name: string): Spec | undefined =>
  specMap.get(name) as Spec | undefined

export const isInvokableActionName = (name: string): name is InvokableName =>
  specMap.has(name)

export const invokeAction = (
  context: Context,
  name: string,
  args: unknown,
): Promise<Result> => {
  const spec = getInvokableSpec(name)
  if (!spec) {
    return Promise.resolve({
      ok: false,
      output: '',
      error: `unknown_action:${name}`,
    })
  }

  return safeRun(() => {
    const parsed = parseArgs(args, spec.schema)
    return spec.run(context, parsed)
  })
}
