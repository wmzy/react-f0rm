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

export default {
  input: {
    index: 'src/index.ts',
    'resolvers/zod': 'src/resolvers/zod.ts',
    'resolvers/yup': 'src/resolvers/yup.ts'
  },
  external,
  plugins: [
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
  ],
  output: [
    // browser-friendly UMD build (index only)
    {
      name: pkg.name,
      amd: {
        id: pkg.name
      },
      globals: {
        react: 'React'
      },
      entryFileNames: '[name].umd.js',
      dir: 'dist',
      sourcemap: true,
      format: 'umd'
    },
    {
      name: pkg.name,
      amd: {
        id: pkg.name
      },
      globals: {
        react: 'React'
      },
      banner,
      entryFileNames: '[name].umd.min.js',
      dir: 'dist',
      sourcemap: true,
      format: 'umd',
      plugins: [terser({output: {comments: /^!/}})]
    },
    {
      entryFileNames: '[name].esm.js',
      dir: 'dist',
      sourcemap: true,
      format: 'es'
    },
    {
      entryFileNames: '[name].cjs.js',
      dir: 'dist',
      sourcemap: true,
      format: 'cjs'
    }
  ]
};
