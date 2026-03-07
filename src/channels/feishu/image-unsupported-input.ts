import { buildUnsupportedImageInputText as buildUnsupportedImageInputTextShared } from '../shared/image-unsupported-input.js'

const PROMPT_PATH = 'manager/feishu-image-unsupported-input.md'

export const buildUnsupportedImageInputText = (
  textLike: unknown,
): Promise<string> =>
  buildUnsupportedImageInputTextShared({
    promptPath: PROMPT_PATH,
    fieldName: 'text',
    fieldValue: textLike,
  })
