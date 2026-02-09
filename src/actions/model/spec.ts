import type { Result } from './result.js'
import type { z } from 'zod'

export type Context = {
  workDir: string
}

type BivariantRun<
  TContext extends Context,
  TArgs extends Record<string, unknown>,
> = {
  bivarianceHack: (context: TContext, args: TArgs) => Promise<Result>
}['bivarianceHack']

export type Spec<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Context = Context,
> = {
  name: string
  schema: z.ZodType<TArgs>
  run: BivariantRun<TContext, TArgs>
}
