import { z } from 'zod'

export const managerPacketModeSchema = z.enum([
  'minimal',
  'standard',
  'expanded',
])
