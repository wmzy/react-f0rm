import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    'comparison',
    'benchmarks',
    'quick-start',
    {
      type: 'category',
      label: 'Guides',
      items: ['guides/validation', 'guides/field-arrays', 'guides/submission', 'guides/sub-forms', 'guides/react19-server-actions', 'guides/ssr', 'guides/typescript', 'guides/custom-components', 'guides/ui-integration', 'guides/testing', 'guides/hooks-reference', 'guides/headless-react-native'],
    },
    {
      type: 'category',
      label: 'API',
      items: ['api/form', 'api/field', 'api/use-form', 'api/use-field', 'api/use-field-array', 'api/create-form-context', 'api/subscribe', 'api/resolvers'],
    },
    {
      type: 'category',
      label: 'Examples',
      items: ['examples/basic', 'examples/dynamic', 'examples/real-world-form'],
    },
    {
      type: 'category',
      label: 'Migration',
      items: ['migration/from-formik', 'migration/from-react-hook-form', 'migration/from-tanstack-form', 'migration/breaking-changes'],
    },
  ],
};

export default sidebars;
