import { describe, expect, it } from 'vitest'

import { loadWebUiAsset } from '../src/server/webui.js'

describe('loadWebUiAsset', () => {
  it('serves index.html', async () => {
    const asset = await loadWebUiAsset('/')
    expect(asset).not.toBeNull()
    expect(asset?.contentType).toContain('text/html')
    expect(asset?.body).toContain('data-task-form')
  })

  it('serves app.js', async () => {
    const asset = await loadWebUiAsset('/webui/app.js')
    expect(asset).not.toBeNull()
    expect(asset?.contentType).toContain('text/javascript')
    expect(asset?.body).toContain('fetch')
  })

  it('serves styles.css', async () => {
    const asset = await loadWebUiAsset('/webui/styles.css')
    expect(asset).not.toBeNull()
    expect(asset?.contentType).toContain('text/css')
    expect(asset?.body).toContain(':root')
  })

  it('returns null for unknown paths', async () => {
    const asset = await loadWebUiAsset('/missing')
    expect(asset).toBeNull()
  })
})
