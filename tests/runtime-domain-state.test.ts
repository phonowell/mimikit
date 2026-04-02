import { expect, test } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

test('runtime state exposes explicit domain and process partitions', async () => {
  const runtime = await createTestRuntimeState()

  expect(runtime).toHaveProperty('domain')
  expect(runtime).toHaveProperty('process')

  expect(runtime.domain).toMatchObject({
    tasks: expect.any(Array),
    taskPlans: expect.any(Array),
    focuses: expect.any(Array),
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
  })
  expect(runtime.process.session).toMatchObject({
    stopped: false,
    channelTargets: {},
  })
  expect(runtime.process.manager).toMatchObject({
    running: false,
    turn: 0,
  })
  expect(runtime.process.worker).toBeDefined()
  expect(runtime.process.ui).toBeDefined()

  expect('tasks' in runtime).toBe(false)
  expect('taskPlans' in runtime).toBe(false)
  expect('focuses' in runtime).toBe(false)
  expect('queues' in runtime).toBe(false)
  expect('session' in runtime).toBe(false)
  expect('manager' in runtime).toBe(false)
  expect('worker' in runtime).toBe(false)
  expect('ui' in runtime).toBe(false)
})
