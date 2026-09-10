import type {StorybookConfig} from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|ts|tsx)'
  ],

  addons: ['@storybook/addon-links', '@storybook/addon-docs'],

  framework: {
    name: '@storybook/react-vite',
    options: {}
  },

  typescript: {
    reactDocgen: 'react-docgen-typescript'
  },

  viteFinal: async config => {
    // Relative asset paths: the built gallery is published under
    // /react-f0rm/storybook/ on GitHub Pages (docs-site/build/storybook),
    // so absolute /assets URLs would 404.
    config.base = './';
    // rollup.config.js and vitest.config.ts replace __DEV__ at build/test
    // time; the storybook vite build does neither, so the identifier is
    // undefined and every story fails to render. The gallery is a dev
    // surface — define it as true (DEV snapshot guards on).
    config.define = {...config.define, __DEV__: 'true'};
    return config;
  }
};

export default config;
