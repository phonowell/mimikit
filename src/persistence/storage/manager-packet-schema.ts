import { z } from 'zod'

export const MANAGER_PACKET_MAX_WORKING_FOCUS_IDS = 5

export const managerPacketModeSchema = z.enum(['minimal', 'standard'])

export const managerPacketWorkingFocusIdSchema = z.string().trim().min(1)

export const managerPacketWorkingFocusIdsSchema = z
  .array(managerPacketWorkingFocusIdSchema)
  .max(MANAGER_PACKET_MAX_WORKING_FOCUS_IDS)
