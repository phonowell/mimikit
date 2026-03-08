import { ratio, type ScoreValue, type TaskResultPacket } from './score-runtime-window-model.js'

type GoldenCase = {
  id: string
  optional?: boolean
  expected: {
    status?: 'succeeded' | 'failed' | 'canceled'
    requireEvidence?: boolean
  }
}

export const evaluateGoldenRates = (params: {
  results: TaskResultPacket[]
  goldenCases?: GoldenCase[]
}): { goldenReplayMatchRate: ScoreValue; replayDeterminismRate: ScoreValue } => {
  if (!params.goldenCases || params.goldenCases.length === 0)
    return {
      goldenReplayMatchRate: 'na',
      replayDeterminismRate: 'na',
    }

  const latestByTaskId = new Map(params.results.map((item) => [item.taskId, item]))
  const requiredCases = params.goldenCases.filter((item) => item.optional !== true)
  const matchedRequired = requiredCases.filter((item) => {
    const result = latestByTaskId.get(item.id)
    if (!result) return false
    const statusMatch =
      !item.expected.status || item.expected.status === result.status
    const evidenceMatch =
      item.expected.requireEvidence === undefined
        ? true
        : item.expected.requireEvidence === Boolean(result.evidence)
    return statusMatch && evidenceMatch
  }).length
  const goldenReplayMatchRate = ratio(matchedRequired, requiredCases.length)
  return {
    goldenReplayMatchRate,
    replayDeterminismRate: goldenReplayMatchRate,
  }
}
