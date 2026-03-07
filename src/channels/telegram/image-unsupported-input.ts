import { buildUnsupportedImageInputText as buildUnsupportedImageInputTextShared } from '../shared/image-unsupported-input.js'

const PROMPT_PATH = 'manager/telegram-image-unsupported-input.md'

export const buildUnsupportedImageInputText = (
  captionLike: unknown,
): Promise<string> =>
  buildUnsupportedImageInputTextShared({
    promptPath: PROMPT_PATH,
    fieldName: 'caption',
    fieldValue: captionLike,
  })
