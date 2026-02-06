import type { ReplayAssertionResult, ReplayCase } from './replay-types.js'

export const buildReplayCommandStats = (
  commands: Array<{ action: string }>,
): Record<string, number> => {
  const stats: Record<string, number> = {}
  for (const command of commands) {
    const current = stats[command.action] ?? 0
    stats[command.action] = current + 1
  }
  return stats
}

export const buildReplayAssertions = (params: {
  replayCase: ReplayCase
  output: string
  commandStats: Record<string, number>
}): ReplayAssertionResult[] => {
  const assertions: ReplayAssertionResult[] = []
  const commandExpect = params.replayCase.expect?.commands ?? {}
  for (const [action, limit] of Object.entries(commandExpect)) {
    const count = params.commandStats[action] ?? 0
    if (limit.min !== undefined) {
      const passed = count >= limit.min
      assertions.push({
        kind: 'command-min',
        target: action,
        passed,
        message: passed
          ? `${action} count ${count} >= ${limit.min}`
          : `${action} count ${count} < ${limit.min}`,
      })
    }
    if (limit.max !== undefined) {
      const passed = count <= limit.max
      assertions.push({
        kind: 'command-max',
        target: action,
        passed,
        message: passed
          ? `${action} count ${count} <= ${limit.max}`
          : `${action} count ${count} > ${limit.max}`,
      })
    }
  }

  const mustContain = params.replayCase.expect?.output?.mustContain ?? []
  for (const needle of mustContain) {
    const passed = params.output.includes(needle)
    assertions.push({
      kind: 'output-must-contain',
      target: needle,
      passed,
      message: passed
        ? `output contains: ${needle}`
        : `output missing: ${needle}`,
    })
  }

  const mustNotContain = params.replayCase.expect?.output?.mustNotContain ?? []
  for (const needle of mustNotContain) {
    const passed = !params.output.includes(needle)
    assertions.push({
      kind: 'output-must-not-contain',
      target: needle,
      passed,
      message: passed
        ? `output not contains: ${needle}`
        : `output should not contain: ${needle}`,
    })
  }

  return assertions
}
