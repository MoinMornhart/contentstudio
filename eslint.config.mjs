import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'blender/**', 'test-output/**', 'upstream/**', 'premiere-plugin/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts', 'tests/fixtures/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } }
  }
)
