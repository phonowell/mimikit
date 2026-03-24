import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-'))
