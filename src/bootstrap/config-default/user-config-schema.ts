import { z } from 'zod'

import { telegramConfigSchema } from '../../surface/channels/telegram/config.js'

export const modelReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])
export type ModelReasoningEffort = z.infer<typeof modelReasoningEffortSchema>

export const providerCapabilitySchema = z.enum(['low', 'medium', 'high'])
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>

export const providerBillingSchema = z.enum(['free', 'low', 'medium', 'high'])
export type ProviderBilling = z.infer<typeof providerBillingSchema>

const managerInputSchema = z
  .object({
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    proxy: z.string().optional(),
    maxCorrectionRounds: z.number().int().positive().optional(),
  })
  .strict()

const workerInputSchema = z
  .object({
    maxConcurrent: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict()

const codexInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().min(1).optional(),
    modelReasoningEffort: modelReasoningEffortSchema.optional(),
    proxy: z.string().optional(),
    capability: providerCapabilitySchema.optional(),
    billing: providerBillingSchema.optional(),
  })
  .strict()

const webuiInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().positive().max(65535).optional(),
  })
  .strict()

export const userConfigInputSchema = z
  .object({
    manager: managerInputSchema.optional(),
    worker: workerInputSchema.optional(),
    codex: codexInputSchema.optional(),
    webui: webuiInputSchema.optional(),
    telegram: telegramConfigSchema.partial().strict().optional(),
  })
  .strict()

export type UserConfigInput = z.infer<typeof userConfigInputSchema>
