const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const ICON_SPRITE_PATH = '/icons/sprite.svg'
const INLINE_ICON_SPRITE_ID = 'icon-sprite-inline'
const INLINE_ICON_SPRITE_STYLE =
  'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'

let inlineIconSpriteReady = false
let inlineIconSpritePromise = null

const resolveIconFragment = (value) => {
  if (typeof value !== 'string') return null
  const hashIndex = value.indexOf('#icon-')
  if (hashIndex === -1) return null
  return value.slice(hashIndex)
}

const rewriteUseHrefToLocalFragment = (useEl) => {
  const hrefValue =
    useEl.getAttribute('href') ||
    useEl.getAttribute('xlink:href') ||
    useEl.getAttributeNS(XLINK_NS, 'href') ||
    ''
  const fragment = resolveIconFragment(hrefValue)
  if (!fragment) return
  useEl.setAttribute('href', fragment)
  useEl.setAttributeNS(XLINK_NS, 'xlink:href', fragment)
}

const rewriteAllIconUseHref = () => {
  const useNodes = document.querySelectorAll('use')
  for (const useNode of useNodes) rewriteUseHrefToLocalFragment(useNode)
}

const extractSpriteSymbols = (source) => {
  const matched = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)
  if (!matched) return ''
  return matched[1]?.trim() ?? ''
}

export const ensureInlineIconSprite = async () => {
  if (inlineIconSpriteReady) return true
  if (inlineIconSpritePromise) return inlineIconSpritePromise
  if (typeof document === 'undefined' || typeof fetch !== 'function') return false

  const existingSprite = document.getElementById(INLINE_ICON_SPRITE_ID)
  if (existingSprite instanceof SVGSVGElement) {
    inlineIconSpriteReady = true
    rewriteAllIconUseHref()
    return true
  }

  inlineIconSpritePromise = (async () => {
    const response = await fetch(ICON_SPRITE_PATH, { cache: 'no-store' })
    if (!response.ok) return false
    const source = await response.text()
    const symbols = extractSpriteSymbols(source)
    if (!symbols) return false

    const inlineSprite = document.createElementNS(SVG_NS, 'svg')
    inlineSprite.id = INLINE_ICON_SPRITE_ID
    inlineSprite.setAttribute('aria-hidden', 'true')
    inlineSprite.setAttribute('focusable', 'false')
    inlineSprite.setAttribute('style', INLINE_ICON_SPRITE_STYLE)
    inlineSprite.innerHTML = symbols
    document.body.prepend(inlineSprite)

    inlineIconSpriteReady = true
    rewriteAllIconUseHref()
    return true
  })().finally(() => {
    inlineIconSpritePromise = null
  })

  return inlineIconSpritePromise
}

export const createIconElement = (iconName) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.classList.add('icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS(SVG_NS, 'use')
  const spriteRef = inlineIconSpriteReady
    ? `#icon-${iconName}`
    : `${ICON_SPRITE_PATH}#icon-${iconName}`
  use.setAttribute('href', spriteRef)
  use.setAttributeNS(XLINK_NS, 'xlink:href', spriteRef)
  svg.appendChild(use)
  return svg
}
