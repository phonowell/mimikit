import { shortId } from '../ids.js'

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const makeSlug = (text: string): string => {
  const slug = slugify(text).slice(0, 32)
  if (slug.length >= 4) return slug
  return `mem-${shortId()}`
}
