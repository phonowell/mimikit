import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  optionalNumber,
  parseHistoryMessage,
  parseStringArray,
  parseTask,
  parseTaskResult,
  parseUserInput,
  requireArray,
  requireRecord,
  requireString,
} from './replay-parse.js'
import {
  type ReplaySuite,
  type ReplaySuiteBundle,
  type ReplaySuiteEntry,
  ReplaySuiteFormatError,
} from './replay-types.js'

const parseCommandExpect = (
  value: unknown,
  path: string,
): Record<string, { min?: number; max?: number }> => {
  const commands = requireRecord(value, path)
  return Object.fromEntries(
    Object.entries(commands).map(([action, limitValue]) => {
      const limit = requireRecord(limitValue, `${path}.${action}`)
      const min = optionalNumber(limit.min, `${path}.${action}.min`)
      const max = optionalNumber(limit.max, `${path}.${action}.max`)
      return [
        action,
        {
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
        },
      ]
    }),
  )
}

const parseOutputExpect = (
  value: unknown,
  path: string,
): { mustContain?: string[]; mustNotContain?: string[] } => {
  const output = requireRecord(value, path)
  return {
    ...(output.mustContain !== undefined
      ? {
          mustContain: parseStringArray(
            output.mustContain,
            `${path}.mustContain`,
          ),
        }
      : {}),
    ...(output.mustNotContain !== undefined
      ? {
          mustNotContain: parseStringArray(
            output.mustNotContain,
            `${path}.mustNotContain`,
          ),
        }
      : {}),
  }
}

const parsePositiveInteger = (value: unknown, path: string): number => {
  const parsed = optionalNumber(value, path)
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0)
    throw new ReplaySuiteFormatError(`${path} must be a positive integer`)
  return parsed
}

const parseRepeat = (
  value: unknown,
  path: string,
): { count: number; idFormat?: string } => {
  const repeat = requireRecord(value, path)
  return {
    count: parsePositiveInteger(repeat.count, `${path}.count`),
    ...(repeat.idFormat !== undefined
      ? {
          idFormat: requireString(repeat.idFormat, `${path}.idFormat`),
        }
      : {}),
  }
}

export const loadReplaySuite = async (path: string): Promise<ReplaySuite> => {
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ReplaySuiteFormatError(`invalid JSON: ${path}`)
  }

  const root = requireRecord(parsed, 'suite')
  const version = optionalNumber(root.version, 'version')
  if (version === undefined || !Number.isInteger(version) || version < 1)
    throw new ReplaySuiteFormatError('version must be a positive integer')

  const cases = requireArray(root.cases, 'cases').map((item, caseIndex) => {
    const casePath = `cases[${caseIndex}]`
    const record = requireRecord(item, casePath)
    const expectValue = record.expect === undefined ? {} : record.expect
    const expect = requireRecord(expectValue, `${casePath}.expect`)

    const parsedExpect = {
      ...(expect.commands !== undefined
        ? {
            commands: parseCommandExpect(
              expect.commands,
              `${casePath}.expect.commands`,
            ),
          }
        : {}),
      ...(expect.output !== undefined
        ? {
            output: parseOutputExpect(
              expect.output,
              `${casePath}.expect.output`,
            ),
          }
        : {}),
    }

    return {
      id: requireString(record.id, `${casePath}.id`),
      ...(record.description !== undefined
        ? {
            description: requireString(
              record.description,
              `${casePath}.description`,
            ),
          }
        : {}),
      history: requireArray(record.history, `${casePath}.history`).map(
        (historyItem, historyIndex) =>
          parseHistoryMessage(
            historyItem,
            `${casePath}.history[${historyIndex}]`,
          ),
      ),
      inputs: requireArray(record.inputs, `${casePath}.inputs`).map(
        (inputItem, inputIndex) =>
          parseUserInput(inputItem, `${casePath}.inputs[${inputIndex}]`),
      ),
      tasks: requireArray(record.tasks, `${casePath}.tasks`).map(
        (taskItem, taskIndex) =>
          parseTask(taskItem, `${casePath}.tasks[${taskIndex}]`),
      ),
      results: requireArray(record.results, `${casePath}.results`).map(
        (resultItem, resultIndex) =>
          parseTaskResult(resultItem, `${casePath}.results[${resultIndex}]`),
      ),
      ...(record.repeat !== undefined
        ? { repeat: parseRepeat(record.repeat, `${casePath}.repeat`) }
        : {}),
      ...(Object.keys(parsedExpect).length > 0 ? { expect: parsedExpect } : {}),
    }
  })

  return {
    suite: requireString(root.suite, 'suite'),
    version,
    cases,
  }
}

const parsePositiveWeight = (value: unknown, path: string): number => {
  const parsed = optionalNumber(value, path)
  if (parsed === undefined || !Number.isFinite(parsed) || parsed <= 0)
    throw new ReplaySuiteFormatError(`${path} must be a positive number`)
  return parsed
}

const parseReplaySuiteEntry = (
  value: unknown,
  path: string,
): ReplaySuiteEntry => {
  if (typeof value === 'string') return { path: resolve(value) }
  const record = requireRecord(value, path)
  return {
    path: resolve(requireString(record.path, `${path}.path`)),
    ...(record.weight !== undefined
      ? { weight: parsePositiveWeight(record.weight, `${path}.weight`) }
      : {}),
    ...(record.alias !== undefined
      ? { alias: requireString(record.alias, `${path}.alias`) }
      : {}),
  }
}

export const loadReplaySuiteBundle = async (
  path: string,
): Promise<ReplaySuiteBundle> => {
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ReplaySuiteFormatError(`invalid JSON: ${path}`)
  }
  const root = requireRecord(parsed, 'bundle')
  const suites = requireArray(root.suites, 'suites').map((item, index) =>
    parseReplaySuiteEntry(item, `suites[${index}]`),
  )
  if (suites.length === 0)
    throw new ReplaySuiteFormatError('suites must not be empty')
  return { suites }
}
