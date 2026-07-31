import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// `eslint-config-next` ships native flat configs, so they are spread straight in.
// Routing them through `FlatCompat` instead makes eslintrc try to validate a
// config whose plugin graph is circular, which throws before any file is linted.
const eslintConfig = [
  // Build output and generated files: nothing in them is authored here, and flat
  // config ignores nothing but `node_modules` on its own.
  {
    ignores: ['.next/**', 'out/**', 'next-env.d.ts', '*.tsbuildinfo'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Stating the React version keeps `eslint-plugin-react` out of its autodetect
  // path, which calls an ESLint context API that no longer exists in ESLint 10
  // and throws before a single file is linted. Track the `react` dependency.
  {
    settings: { react: { version: '19.2' } },
  },
];

export default eslintConfig;
