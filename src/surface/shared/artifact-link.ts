export {
  buildArchiveViewerUrlFromSource,
  buildTaskArchiveViewerUrl,
  isArchiveMarkdownPath,
  type SurfaceArtifactLink,
} from './artifact-contract.js'

export { toArtifactUrl, toSurfaceArtifactLink } from './artifact-url.js'

export {
  INLINE_CODE_SEGMENT,
  PATH_TOKEN,
  extractArtifactLinksFromText,
  isMarkdownLinkDestination,
  normalizeSurfaceArtifacts,
  splitTrailingPunctuation,
} from './artifact-text.js'
