export const shortId = (): string =>
  crypto.randomUUID().replace(/-/g, '').slice(0, 8)
