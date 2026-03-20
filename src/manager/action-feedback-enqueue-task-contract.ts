type EnqueueTaskContractHintValues = {
  worker_prompt: string
  title: string
  cwd: string
  goal: string
  in_scope: string
  out_of_scope: string
  done_when_1: string
}

const trimOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

const escapeActionAttrValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const formatEnqueueTaskContractMissingHint = (params: {
  renderHint: (
    key: 'enqueue_task_contract_missing',
    values: Record<string, string>,
  ) => string
  defaults: EnqueueTaskContractHintValues
  attrs?: Partial<EnqueueTaskContractHintValues>
}): string =>
  params.renderHint('enqueue_task_contract_missing', {
    worker_prompt: escapeActionAttrValue(
      trimOrFallback(
        params.attrs?.worker_prompt,
        params.defaults.worker_prompt,
      ),
    ),
    title: escapeActionAttrValue(
      trimOrFallback(params.attrs?.title, params.defaults.title),
    ),
    cwd: escapeActionAttrValue(
      trimOrFallback(params.attrs?.cwd, params.defaults.cwd),
    ),
    goal: escapeActionAttrValue(
      trimOrFallback(params.attrs?.goal, params.defaults.goal),
    ),
    in_scope: escapeActionAttrValue(
      trimOrFallback(params.attrs?.in_scope, params.defaults.in_scope),
    ),
    out_of_scope: escapeActionAttrValue(
      trimOrFallback(params.attrs?.out_of_scope, params.defaults.out_of_scope),
    ),
    done_when_1: escapeActionAttrValue(
      trimOrFallback(params.attrs?.done_when_1, params.defaults.done_when_1),
    ),
  })
