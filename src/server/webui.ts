import fs from 'node:fs/promises'

export type WebUiAsset = {
  contentType: string
  body: string
}

type WebUiAssetEntry = {
  file: URL
  contentType: string
}

const assetMap = new Map<string, WebUiAssetEntry>([
  [
    '/',
    {
      file: new URL('./webui/index.html', import.meta.url),
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/webui/app.js',
    {
      file: new URL('./webui/app.js', import.meta.url),
      contentType: 'text/javascript; charset=utf-8',
    },
  ],
  [
    '/webui/styles.css',
    {
      file: new URL('./webui/styles.css', import.meta.url),
      contentType: 'text/css; charset=utf-8',
    },
  ],
])

const cache = new Map<string, WebUiAsset>()

export const loadWebUiAsset = async (
  pathname: string,
): Promise<WebUiAsset | null> => {
  const entry = assetMap.get(pathname)
  if (!entry) return null
  const cached = cache.get(pathname)
  if (cached) return cached
  const body = await fs.readFile(entry.file, 'utf8')
  const asset = { contentType: entry.contentType, body }
  cache.set(pathname, asset)
  return asset
}
