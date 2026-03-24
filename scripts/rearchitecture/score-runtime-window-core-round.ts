import { buildPaths } from '../../src/persistence/fs/paths.js'
import { readHistory } from '../../src/persistence/history/store.js'
import { readJsonl } from '../../src/persistence/storage/jsonl.js'

import {
  dedupeTaskResultsByLatest,
  filterLogsByWindow,
  loadGoldenCases,
} from './score-runtime-window-data.js'

import type {
  InputPacket,
  JsonPacket,
  LogRow,
  ScoreInput,
  TaskResultPacket,
} from './score-runtime-window-model.js'

export const collectRoundData = async (input: ScoreInput) => {
  const paths = buildPaths(input.workDir)
  const [resultPackets, inputPackets, logRows, history, goldenCases] =
    await Promise.all([
      readJsonl<JsonPacket<TaskResultPacket>>(paths.resultsPackets, {
        ensureFile: true,
      }),
      readJsonl<JsonPacket<InputPacket>>(paths.inputsPackets, {
        ensureFile: true,
      }),
      readJsonl<LogRow>(paths.log, { ensureFile: true }),
      readHistory(paths.history),
      loadGoldenCases(input.goldenSetPath),
    ])

  const windowedRawResults = resultPackets
    .map((item) => item.payload)
    .filter(
      (item) =>
        item.completedAt >= input.windowFrom && item.completedAt <= input.windowTo,
    )

  return {
    history,
    goldenCases,
    windowedRawResults,
    windowedResults: dedupeTaskResultsByLatest(windowedRawResults),
    windowedInputs: inputPackets
      .map((item) => item.payload)
      .filter(
        (item) =>
          item.role === 'user' &&
          item.createdAt >= input.windowFrom &&
          item.createdAt <= input.windowTo,
      ),
    windowedLogRows: filterLogsByWindow(logRows, input.windowFrom, input.windowTo),
  }
}
