const DEFAULT_EXPORT_LIMIT = 200

const parseContentDispositionFilename = (value) => {
  if (typeof value !== 'string') return null
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      return null
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value)
  if (!plain?.[1]) return null
  const trimmed = plain[1].trim()
  return trimmed || null
}

const pad2 = (value) => String(value).padStart(2, '0')

const buildFallbackFilename = () => {
  const now = new Date()
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
  return `mimikit-chat-${date}-${time}.md`
}

const downloadBlob = (blob, filename) => {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

export const bindExport = ({ exportBtn }) => {
  if (!(exportBtn instanceof HTMLButtonElement)) return
  let exporting = false
  const defaultText = exportBtn.textContent?.trim() || 'Export'

  const setBusy = (next) => {
    exporting = next
    exportBtn.disabled = next
    exportBtn.textContent = next ? 'Exporting...' : defaultText
    exportBtn.setAttribute('aria-busy', next ? 'true' : 'false')
  }

  exportBtn.addEventListener('click', async () => {
    if (exporting) return
    setBusy(true)
    try {
      const response = await fetch(`/api/messages/export?limit=${DEFAULT_EXPORT_LIMIT}`)
      if (!response.ok) {
        let data = null
        try {
          data = await response.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || 'Failed to export messages')
      }

      const blob = await response.blob()
      const filename =
        parseContentDispositionFilename(response.headers.get('content-disposition')) ||
        buildFallbackFilename()
      downloadBlob(blob, filename)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[webui] export messages failed', message)
    } finally {
      setBusy(false)
    }
  })
}
