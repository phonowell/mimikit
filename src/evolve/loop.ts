import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type PromotionPolicy } from './decision.js'
import { isRoundImprovement } from './loop-stop.js'
import { runSelfEvolveRound, type SelfEvolveRoundResult } from './round.js'

export type RunSelfEvolveLoopParams = {
  suitePath: string
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
  maxRounds: number
  stopOnNoGain?: boolean
  promotionPolicy?: PromotionPolicy
  model?: string
  optimizerModel?: string
}

export type SelfEvolveLoopRound = {
  round: number
  promote: boolean
  reason: string
  baseline: SelfEvolveRoundResult['baseline']
  candidate: SelfEvolveRoundResult['candidate']
  decisionPath: string
}

export type SelfEvolveLoopResult = {
  stoppedReason: 'max_rounds' | 'no_gain'
  rounds: SelfEvolveLoopRound[]
  bestRound?: number
}

const writeLoopReport = async (
  outDir: string,
  result: SelfEvolveLoopResult,
): Promise<void> => {
  await mkdir(outDir, { recursive: true })
  const path = resolve(outDir, 'loop-report.json')
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

export const runSelfEvolveLoop = async (
  params: RunSelfEvolveLoopParams,
): Promise<SelfEvolveLoopResult> => {
  const rounds: SelfEvolveLoopRound[] = []
  let stoppedReason: SelfEvolveLoopResult['stoppedReason'] = 'max_rounds'
  const stopOnNoGain = params.stopOnNoGain !== false
  for (let index = 0; index < params.maxRounds; index += 1) {
    const round = index + 1
    const roundOutDir = resolve(params.outDir, `round-${round}`)
    const roundStateDir = resolve(params.stateDir, `round-${round}`)
    const result = await runSelfEvolveRound({
      suitePath: params.suitePath,
      outDir: roundOutDir,
      stateDir: roundStateDir,
      workDir: params.workDir,
      promptPath: params.promptPath,
      timeoutMs: params.timeoutMs,
      ...(params.promotionPolicy
        ? { promotionPolicy: params.promotionPolicy }
        : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.optimizerModel
        ? { optimizerModel: params.optimizerModel }
        : {}),
    })
    const loopRound: SelfEvolveLoopRound = {
      round,
      promote: result.promote,
      reason: result.reason,
      baseline: result.baseline,
      candidate: result.candidate,
      decisionPath: result.decisionPath,
    }
    rounds.push(loopRound)

    if (stopOnNoGain && !result.promote) {
      stoppedReason = 'no_gain'
      break
    }

    if (
      stopOnNoGain &&
      !isRoundImprovement(
        result.baseline,
        result.candidate,
        params.promotionPolicy,
      )
    ) {
      stoppedReason = 'no_gain'
      break
    }
  }

  let bestRound: number | undefined
  for (const round of rounds) {
    if (!round.promote) continue
    bestRound = round.round
  }
  const finalResult: SelfEvolveLoopResult = {
    stoppedReason,
    rounds,
    ...(bestRound !== undefined ? { bestRound } : {}),
  }
  await writeLoopReport(params.outDir, finalResult)
  return finalResult
}
