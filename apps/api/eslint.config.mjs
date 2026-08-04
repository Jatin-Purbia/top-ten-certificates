import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.ts'], languageOptions: { globals: globals.node },
  rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_|^claimHash$', varsIgnorePattern: '^claimHash$', caughtErrorsIgnorePattern: '^e$' }] }
});
