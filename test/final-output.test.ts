import { expect, test } from 'vitest'

import { validateWorkerFinalOutput } from '../src/worker/final-output.js'

const validPayload = {
  answer: 'task completed',
  evidence: [{ ref: 'action:1.1', summary: 'command output verified' }],
  sources: ['local:stdout'],
  checks: [{ name: 'net_equals_sum', passed: true, detail: 'verified' }],
  confidence: 0.88,
  execution_insights: {
    summary: 'one friction handled',
    blockers: [
      {
        stage: 'execute',
        type: 'auth',
        symptom: 'missing login',
        impact: 'could not access private page',
        attempts: ['retry without login', 'switch public endpoint'],
        resolved: true,
        resolution: 'used public endpoint',
        suggestion: 'inject login state when required',
        suggested_prompt_delta: 'add login check before scraping',
        expected_roi: 'high',
        confidence: 0.8,
      },
    ],
    next_run_hints: ['prefer authenticated api first'],
  },
}

test('accepts fenced json and normalizes output', () => {
  const raw = `\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\``
  const result = validateWorkerFinalOutput({
    raw,
    profile: 'specialist',
  })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.data.answer).toBe('task completed')
})

test('rejects unknown evidence refs for standard profile', () => {
  const result = validateWorkerFinalOutput({
    raw: JSON.stringify(validPayload),
    profile: 'standard',
    evidenceRefs: new Set(['action:9.9']),
  })
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.errors[0]).toContain('unknown_evidence_refs')
})

test('rejects standard evidence refs when action evidence set is empty', () => {
  const result = validateWorkerFinalOutput({
    raw: JSON.stringify(validPayload),
    profile: 'standard',
    evidenceRefs: new Set(),
  })
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.errors[0]).toContain('unknown_evidence_refs')
})

test('rejects failed checks', () => {
  const payload = {
    ...validPayload,
    checks: [{ name: 'consistency', passed: false, detail: 'failed' }],
  }
  const result = validateWorkerFinalOutput({
    raw: JSON.stringify(payload),
    profile: 'specialist',
  })
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.errors[0]).toContain('checks_not_passed')
})
