import { mkdir } from 'node:fs/promises'

export const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const nowStamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, '-')

export const toMs = (valueSec: number): number => Math.max(1, valueSec) * 1000

export const parseTimestamp = (value: string | undefined): number => {
  if (!value) return Date.now()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

export const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true })
}
