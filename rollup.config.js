import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import esbuild from 'rollup-plugin-esbuild';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import pkg from './package.json' with { type: 'json' };

const banner = `
/*!
  * ${pkg.name} v${pkg.version}
  * Copyright (c) 2021-present ${pkg.author}
  */
`;

const extensions = ['.js', '.jsx', '.es6', '.es', '.mjs', '.ts'];
const external = ['react'];

const plugins = [
  replace({
    __DEV__: process.env.NODE_ENV !== 'production',
    preventAssignment: true
  }),
  resolve({
    extensions,
    browser: true
  }),
  commonjs(),
  esbuild({
    target: 'esnext'
  })
];

export default [
  // Main entry — UMD + ESM + CJS
  {
    input: 'src/index.ts',
    external,
    plugins,
    output: [
      {
        name: pkg.name,
        amd: {id: pkg.name},
        globals: {react: 'React'},
        file: pkg.unpkg.replace('.min.', '.'),
        sourcemap: true,
        format: 'umd'
      },
      {
        name: pkg.name,
        amd: {id: pkg.name},
        globals: {react: 'React'},
        banner,
        file: pkg.unpkg,
        sourcemap: true,
        format: 'umd',
        plugins: [terser({output: {comments: /^!/}})]
      },
      {
        file: pkg.module,
        sourcemap: true,
        format: 'es'
      },
      {
        file: pkg.main,
        sourcemap: true,
        format: 'cjs'
      }
    ]
  },
  // Side entries — ESM + CJS only (no UMD). zod/yup reuse the
  // standard-schema module, so rollup emits shared chunks alongside the
  // entry chunks. devtools bundles the core it inspects; like the
  // resolvers it stays out of the main entry's bundle graph.
  {
    input: {
      'resolvers/standard-schema': 'src/resolvers/standard-schema.ts',
      'resolvers/zod': 'src/resolvers/zod.ts',
      'resolvers/yup': 'src/resolvers/yup.ts',
      'devtools/index': 'src/devtools/index.ts'
    },
    external,
    plugins,
    output: [
      {
        dir: 'dist',
        // .mjs so Node natively treats the ESM chunks as modules —
        // extensionless packages default every .js to CommonJS, which
        // forced a reparse (MODULE_TYPELESS_PACKAGE_JSON warning) for
        // file:linked consumers. CJS keeps .cjs.js (default .js parsing
        // is already CommonJS, no rename churn).
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
        sourcemap: true,
        format: 'es'
      },
      {
        dir: 'dist',
        entryFileNames: '[name].cjs.js',
        chunkFileNames: '[name]-[hash].cjs.js',
        sourcemap: true,
        format: 'cjs'
      }
    ]
  },
  // Declaration files
  {
    input: {
      index: 'src/index.ts',
      'resolvers/standard-schema': 'src/resolvers/standard-schema.ts',
      'resolvers/zod': 'src/resolvers/zod.ts',
      'resolvers/yup': 'src/resolvers/yup.ts',
      'devtools/index': 'src/devtools/index.ts'
    },
    plugins: [dts({ tsconfig: './tsconfig.build.json' })],
    output: [
      {
        dir: 'dist',
        entryFileNames: '[name].d.ts',
        chunkFileNames: '[name]-[hash].d.ts',
        format: 'es'
      }
    ]
  }
];
