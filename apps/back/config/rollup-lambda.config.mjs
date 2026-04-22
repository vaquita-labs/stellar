import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
// import { createRequire } from 'module';
// import { dependenciesFirstLayer } from '../scripts/split-package.js';

// const require = createRequire(import.meta.url);
// const pkg = require('./package.json');

// const internalDeps = [
//   '@aws-sdk/client-apigatewaymanagementapi',
//   '@aws-sdk/client-ec2',
//   '@aws-sdk/client-ecs',
//   '@aws-sdk/client-s3',
//   '@aws-sdk/client-sqs',
//   // 'pdfjs-dist',
// ];

export default {
  input: {
    'app': 'src/app.ts',
  },
  output: [
    {
      dir: 'build',
      format: 'cjs',
      // format: 'esm',
      entryFileNames: '[name].js',
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    json(),
    typescript(),
  ],
  external: [
    // ...dependenciesFirstLayer,
    // ...(Object.keys(pkg.dependencies || {}).filter(d => !internalDeps.includes(d))), // Excluir todas las dependencias
  ],
};
