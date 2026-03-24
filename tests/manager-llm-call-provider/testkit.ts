import { beforeEach, vi } from 'vitest'

const hoistedMocks = vi.hoisted(() => ({
  runWithProviderMock: vi.fn(),
}))

export const runWithProviderMock = hoistedMocks.runWithProviderMock

vi.mock('../../src/execution/providers/registry.js', () => ({
  runWithProvider: hoistedMocks.runWithProviderMock,
}))

beforeEach(() => {
  runWithProviderMock.mockReset()
  runWithProviderMock.mockResolvedValue({
    output: 'ok',
    elapsedMs: 5,
  })
})
