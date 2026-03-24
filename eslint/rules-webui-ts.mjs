import { commonTypeScriptRules } from './rules-common-ts.mjs'

export const webuiSrcTsRules = {
  ...commonTypeScriptRules,
  'import/order': [
    'warn',
    {
      alphabetize: {
        caseInsensitive: true,
        order: 'asc',
        orderImportKind: 'asc',
      },
      groups: [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
        'object',
        'type',
      ],
      'newlines-between': 'always',
    },
  ],
}
