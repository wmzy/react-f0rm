import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import babel from '@rollup/plugin-babel';
import {terser} from 'rollup-plugin-terser';
import pkg from './package.json';

const banner = `
/*!
  * ${pkg.name} v${pkg.version}
  * Copyright (c) 2021-present ${pkg.author}
  */
`;

const extensions = ['.js', '.jsx', '.es6', '.es', '.mjs', '.ts'];
const external = ['react'];

export default {
  input: 'src/index.js',
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
    babel({
      extensions,
      exclude: ['node_modules/**']
    })
  ],
  output: [
    // browser-friendly UMD build
    {
      name: pkg.name,
      amd: {
        id: pkg.name
      },
      globals: {
        react: 'React'
      },
      file: pkg.unpkg.replace('.min.', '.'),
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
      file: pkg.unpkg,
      sourcemap: true,
      format: 'umd',
      plugins: [terser({output: {comments: /^!/}})]
    },
    {
      file: pkg.main,
      sourcemap: true,
      format: 'es'
    }
  ]
};
