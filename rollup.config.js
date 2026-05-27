import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import esbuild from 'rollup-plugin-esbuild';
import terser from '@rollup/plugin-terser';
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
    __DEV__: process.env.NODE_ENV !== 'production'
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
  // Resolvers — ESM + CJS only (no UMD)
  {
    input: {
      'resolvers/zod': 'src/resolvers/zod.ts',
      'resolvers/yup': 'src/resolvers/yup.ts'
    },
    external,
    plugins,
    output: [
      {
        dir: 'dist',
        entryFileNames: '[name].esm.js',
        sourcemap: true,
        format: 'es'
      },
      {
        dir: 'dist',
        entryFileNames: '[name].cjs.js',
        sourcemap: true,
        format: 'cjs'
      }
    ]
  }
];
