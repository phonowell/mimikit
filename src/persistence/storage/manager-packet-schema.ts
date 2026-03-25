import { z } from 'zod'

export const managerPacketModeSchema = z.enum([
  'minimal',
  'standard',
  'expanded',
])

export const managerPacketSectionSchema = z.enum([
  'environment',
  'focus_list',
  'working_focuses',
  'remembered_memory',
  'memory',
  'tasks',
  'plans',
  'inputs',
  'batch_results',
  'recent_history',
  'action_feedback',
])

export const managerSectionDigestSchema = z
  .object({
    section: z.enum(['recent_history', 'batch_results']),
    mode: z.literal('digest'),
    sourceBytes: z.number().int().nonnegative(),
    digestBytes: z.number().int().nonnegative(),
    sourceItems: z.number().int().nonnegative(),
    digestItems: z.number().int().nonnegative(),
    sourceRefCount: z.number().int().nonnegative(),
  })
  .strict()
