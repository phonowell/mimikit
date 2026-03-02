export const toPrettyJsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`
