import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <img src="/react-f0rm/img/logo.svg" alt="react-f0rm" className={styles.heroLogo} />
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/quick-start">
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            to="/docs/api/form"
            style={{marginLeft: '1rem', color: '#fff', borderColor: 'rgba(255,255,255,0.5)'}}>
            API Reference
          </Link>
        </div>
        <div className={styles.installCmd}>
          <code>npm install react-f0rm</code>
        </div>
      </div>
    </header>
  );
}

function BundleSize() {
  return (
    <section className={styles.bundleSection}>
      <div className="container">
        <div className="row">
          <div className="col col--4 col--offset-4 text--center">
            <Heading as="h2">Tiny Bundle</Heading>
            <p className={styles.bundleSize}>~3 KB</p>
            <p>gzipped &amp; brotli. No runtime dependencies beyond React.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Lightweight React Form Library"
      description="A tiny, event-driven form library for React with tree-shaking, TypeScript support, and schema validation.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <BundleSize />
      </main>
    </Layout>
  );
}
