export type StandardState = {
  round: number
  transcript: string[]
  evidenceRefs: string[]
  repairAttempts: number
  finalized: boolean
  finalOutput: string
}

export const initialStandardState = (): StandardState => ({
  round: 0,
  transcript: [],
  evidenceRefs: [],
  repairAttempts: 0,
  finalized: false,
  finalOutput: '',
})

export const normalizeStandardState = (raw: unknown): StandardState => {
  if (!raw || typeof raw !== 'object') return initialStandardState()
  const record = raw as Partial<StandardState>
  return {
    round:
      typeof record.round === 'number' && record.round >= 0
        ? Math.floor(record.round)
        : 0,
    transcript: Array.isArray(record.transcript)
      ? record.transcript.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    evidenceRefs: Array.isArray(record.evidenceRefs)
      ? record.evidenceRefs.filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
      : [],
    repairAttempts:
      typeof record.repairAttempts === 'number' && record.repairAttempts >= 0
        ? Math.floor(record.repairAttempts)
        : 0,
    finalized: record.finalized === true,
    finalOutput:
      typeof record.finalOutput === 'string' ? record.finalOutput : '',
  }
}
