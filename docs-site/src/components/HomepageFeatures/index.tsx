import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  icon: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Event-Driven',
    icon: '⚡',
    description: (
      <>
        Updates are driven by an event emitter, not React state. Only fields
        that change re-render — not the entire form.
      </>
    ),
  },
  {
    title: 'Tree-Shakeable',
    icon: '🌲',
    description: (
      <>
        Every function is independently exported. If you don't use field arrays
        or schema resolvers, they're eliminated from your bundle automatically.
      </>
    ),
  },
  {
    title: 'TypeScript Native',
    icon: '🔷',
    description: (
      <>
        Written in TypeScript with full type inference. Generic form types flow
        through hooks and components — no manual type annotations needed.
      </>
    ),
  },
  {
    title: 'Schema Validation',
    icon: '✅',
    description: (
      <>
        First-class support for Zod and Yup via tree-shakeable resolvers.
        Also supports field-level and form-level validation functions.
      </>
    ),
  },
  {
    title: 'Field Arrays',
    icon: '📋',
    description: (
      <>
        Built-in <code>useFieldArray</code> hook with stable IDs, plus
        append, prepend, insert, remove, swap, and move operations.
      </>
    ),
  },
  {
    title: 'Submission State',
    icon: '🚀',
    description: (
      <>
        Track <code>isSubmitting</code>, <code>submitCount</code>, and{' '}
        <code>isSubmitSuccessful</code> out of the box. Built-in double-submit
        protection.
      </>
    ),
  },
];

function Feature({title, description, icon}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>{icon}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
