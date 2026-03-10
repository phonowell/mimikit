type RequiredField = {
  key: string
  value: string
}

export const assertRequiredChannelFields = (params: {
  channel: string
  fields: RequiredField[]
  messageKeys?: string[]
}): void => {
  const missing = params.fields.filter((field) => !field.value.trim())
  if (missing.length === 0) return
  const keys = (
    params.messageKeys && params.messageKeys.length > 0
      ? params.messageKeys.map((key) => `${params.channel}.${key}`)
      : missing.map((field) => `${params.channel}.${field.key}`)
  ).join(' and ')
  throw new Error(`[config] ${params.channel}.enabled=true requires ${keys}`)
}
