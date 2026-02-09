import { pruneChannelBefore } from '../../streams/channels.js'

export type ChannelPruneTarget = {
  path: string
  cursor: number
}

export const pruneChannelsByCursor = async (params: {
  enabled: boolean
  keepRecent: number
  targets: ChannelPruneTarget[]
}): Promise<void> => {
  if (!params.enabled) return
  const keepRecent = Math.max(1, params.keepRecent)
  const pruneOps = params.targets
    .map((target) => ({
      path: target.path,
      keepFromCursor: target.cursor - keepRecent + 1,
    }))
    .filter((target) => target.keepFromCursor > 1)
    .map((target) => pruneChannelBefore(target))
  if (pruneOps.length === 0) return
  await Promise.all(pruneOps)
}
