import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Frontend lint only — backend/ has its own eslint.config.js.
export default tseslint.config(
  { ignores: ['backend/**', 'design/**', 'docs/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
