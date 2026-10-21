// @ts-check
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      'pipelines/**',
      '.venv/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Seguridad: nada de HTML inyectado sin revisión explícita.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML está prohibido (docs/security.md). Usa JSX.',
        },
      ],
    },
  },
  // Accesibilidad estática de JSX (complementa las pruebas con axe).
  {
    files: ['**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  // Frontera de dominios (ADR-0001): el dominio es lógica pura, sin UI ni framework.
  {
    files: ['src/domains/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/components/*',
                '@/app/*',
                '@/adapters/*',
                '@/server/*',
                'pg',
                'pg/*',
                'react',
                'react-dom',
                'next',
                'next/*',
                'next-intl',
                'next-intl/*',
              ],
              message:
                'src/domains es lógica pura: no importa UI, framework ni adaptadores (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  // El código de servidor (BD, `pg`) no entra en componentes: acabaría en el bundle del navegador.
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/*', 'pg', 'pg/*'],
              message:
                'El acceso a la BD es solo de servidor (src/server): no lo importes en componentes.',
            },
          ],
        },
      ],
    },
  },
  // Configuración de ESLint (JS sin tipos): sin reglas que exigen información de tipos.
  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  // Scripts y configuraciones: relajar solo lo estrictamente necesario.
  {
    files: [
      'scripts/**/*.ts',
      '*.config.ts',
      '*.config.mjs',
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'e2e/**/*.ts',
      'e2e-db/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
);
