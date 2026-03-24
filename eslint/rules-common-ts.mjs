export const commonTypeScriptRules = {
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-ignore': 'allow-with-description',
    },
  ],
  '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    {
      prefer: 'type-imports',
    },
  ],
  '@typescript-eslint/no-explicit-any': [
    'warn',
    {
      fixToUnknown: true,
    },
  ],
  '@typescript-eslint/no-unused-vars': 'off',
  'unused-imports/no-unused-imports': 'error',
  'unused-imports/no-unused-vars': [
    'warn',
    {
      vars: 'all',
      varsIgnorePattern: '^_',
      args: 'after-used',
      argsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    {
      allowNumber: true,
    },
  ],
  'arrow-body-style': ['warn', 'as-needed'],
  curly: ['warn', 'multi-or-nest'],
  eqeqeq: 'error',
  'func-style': ['warn', 'expression'],
  'import/extensions': [
    'error',
    'always',
    {
      ignorePackages: true,
    },
  ],
  'import/no-duplicates': 'warn',
  'no-console': 'off',
  'no-else-return': 'error',
  'no-return-await': 'error',
  'no-var': 'error',
  'prefer-const': [
    'warn',
    {
      destructuring: 'all',
    },
  ],
  'prettier/prettier': [
    'warn',
    {
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
    },
  ],
  'require-await': 'error',
}
