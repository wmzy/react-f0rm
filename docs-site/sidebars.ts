import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    'comparison',
    'quick-start',
    {
      type: 'category',
      label: 'Guides',
      items: ['guides/validation', 'guides/field-arrays', 'guides/submission', 'guides/typescript', 'guides/custom-components'],
    },
    {
      type: 'category',
      label: 'API',
      items: ['api/form', 'api/field', 'api/use-form', 'api/use-field', 'api/use-field-array', 'api/resolvers'],
    },
    {
      type: 'category',
      label: 'Examples',
      items: ['examples/basic', 'examples/dynamic'],
    },
    {
      type: 'category',
      label: 'Migration',
      items: ['migration/from-formik', 'migration/from-react-hook-form'],
    },
  ],
};

export default sidebars;
