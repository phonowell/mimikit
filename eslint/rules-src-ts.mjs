import { commonTypeScriptRules } from './rules-common-ts.mjs'

export const srcTsRules = {
  ...commonTypeScriptRules,
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'as',
      objectLiteralTypeAssertions: 'allow-as-parameter',
    },
  ],
  '@typescript-eslint/explicit-member-accessibility': [
    'warn',
    {
      accessibility: 'no-public',
    },
  ],
  '@typescript-eslint/method-signature-style': ['warn', 'property'],
  '@typescript-eslint/no-confusing-void-expression': 'off',
  '@typescript-eslint/no-empty-function': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/no-unnecessary-condition': 'warn',
  '@typescript-eslint/no-unused-expressions': [
    'error',
    {
      allowShortCircuit: true,
      allowTaggedTemplates: true,
      allowTernary: true,
      enforceForJSX: true,
    },
  ],
  '@typescript-eslint/prefer-nullish-coalescing': 'warn',
  '@typescript-eslint/prefer-optional-chain': 'warn',
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
      pathGroups: [
        {
          group: 'builtin',
          pattern: '{.,@}/**/*.{css,scss,styl}',
          position: 'before',
        },
        {
          group: 'builtin',
          pattern: '{.,@}/**/polyfills.{js,ts}',
          position: 'before',
        },
      ],
      warnOnUnassignedImports: true,
    },
  ],
  'sort-imports': [
    'warn',
    {
      ignoreCase: true,
      ignoreDeclarationSort: true,
      ignoreMemberSort: false,
      memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
    },
  ],
  'no-constant-condition': 'error',
  'no-debugger': 'warn',
  'no-dupe-keys': 'error',
  'no-restricted-globals': ['warn', 'toString'],
  'no-throw-literal': 'off',
  'no-unexpected-multiline': 'error',
  'no-unneeded-ternary': 'error',
  'no-unreachable': 'error',
  'no-useless-backreference': 'error',
  'no-useless-call': 'error',
  'no-useless-catch': 'error',
  'no-useless-computed-key': 'warn',
  'no-useless-concat': 'warn',
  'no-useless-constructor': 'warn',
  'no-useless-rename': 'warn',
  'no-useless-return': 'warn',
  'object-shorthand': 'warn',
  'one-var': ['warn', 'never'],
  'prefer-arrow-callback': 'warn',
  'prefer-destructuring': [
    'warn',
    {
      AssignmentExpression: {
        array: false,
        object: false,
      },
      VariableDeclarator: {
        array: false,
        object: true,
      },
    },
  ],
  'prefer-exponentiation-operator': 'warn',
  'prefer-numeric-literals': 'warn',
  'prefer-object-spread': 'warn',
  'prefer-template': 'warn',
}
