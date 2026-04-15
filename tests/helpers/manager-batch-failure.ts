import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTestRuntimeState } from './runtime-state.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const createManagerBatchFailureRuntimeKit = () => {
  const tempDirs: string[] = []

  const createRuntime = async (params: {
    runtimeId: string
    tempDirPrefix: string
  }): Promise<RuntimeState> => {
    const workDir = await mkdtemp(join(tmpdir(), params.tempDirPrefix))
    tempDirs.push(workDir)
    const runtime = await createTestRuntimeState({
      workDir,
      runtimeId: params.runtimeId,
      pausedQueue: true,
    })
    const now = new Date().toISOString()
    runtime.domain.focuses.push({
      id: 'focus-main',
      title: 'Main',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    })
    return runtime
  }

  const cleanup = async (): Promise<void> => {
    for (const dir of tempDirs.splice(0, tempDirs.length))
      await rm(dir, { recursive: true, force: true })
  }

  return {
    cleanup,
    createRuntime,
  }
}
