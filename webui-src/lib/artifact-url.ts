import { toArtifactUrl } from '../../src/surface/shared/artifact-link.js'

export {
  extractArtifactLinksFromText,
  normalizeSurfaceArtifacts,
  toArtifactUrl,
  toSurfaceArtifactLink,
  type SurfaceArtifactLink,
} from '../../src/surface/shared/artifact-link.js'

export const linkifyInlineCode = (fragment: ParentNode): void => {
  const codes = fragment.querySelectorAll('code')
  for (const code of codes) {
    if (code.closest('pre') || code.closest('a')) continue
    if (code.childElementCount > 0) continue
    const raw = code.textContent ?? ''
    const text = raw.trim()
    if (!text || text !== raw) continue
    const rewritten = toArtifactUrl(text)
    if (!rewritten) continue
    const link = document.createElement('a')
    link.setAttribute('href', rewritten)
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
    link.appendChild(code.cloneNode(true))
    code.replaceWith(link)
  }
}
