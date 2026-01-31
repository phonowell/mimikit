export const newId = (): string => crypto.randomUUID().replace(/-/g, '')

export const shortId = (): string => newId().slice(0, 8)
