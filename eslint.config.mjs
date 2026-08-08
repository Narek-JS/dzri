import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build output of the integration test server.
    '.next-test/**',
    // Generated migrations.
    'drizzle/**',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // BRAND.md: the four Tailwind theme tokens (brand, brand-strong,
      // brand-tint, brand-dark) are the only colors app code is allowed to
      // spell out. src/app/globals.css is where those four are *defined*
      // and is exempt below; everywhere else — a string literal or a
      // template literal containing a hex triplet/sextet/octet — is a
      // color that skipped the token system.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?(?![0-9a-fA-F])/]',
          message:
            'No raw hex colors in app code — use a brand token (brand, brand-strong, brand-tint, brand-dark) from the Tailwind theme. See BRAND.md.',
        },
        {
          selector:
            'TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?(?![0-9a-fA-F])/]',
          message:
            'No raw hex colors in app code — use a brand token (brand, brand-strong, brand-tint, brand-dark) from the Tailwind theme. See BRAND.md.',
        },
      ],
    },
  },
]);

export default eslintConfig;
