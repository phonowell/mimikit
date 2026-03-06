const SVG_NS = 'http://www.w3.org/2000/svg'
const ICON_SPRITE_PATH = '/icons/sprite.svg'

export const createIconElement = (iconName) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.classList.add('icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `${ICON_SPRITE_PATH}#icon-${iconName}`)
  svg.appendChild(use)
  return svg
}
