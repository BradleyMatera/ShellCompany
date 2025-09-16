import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Autonomous AI Workforce',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        A complete ecosystem of 37+ specialized AI agents working together seamlessly.
        From creative design to full-stack development, our agents handle complex
        projects with minimal human oversight.
      </>
    ),
  },
  {
    title: 'Intelligent Workflow Orchestration',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Smart task routing through our <strong>Board Room → Analysis → Execution → Review</strong> cycle.
        Built-in quality gates ensure every project meets enterprise standards
        before delivery.
      </>
    ),
  },
  {
    title: 'Enterprise-Grade Architecture',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Built with React, Node.js, and PostgreSQL. Features real-time monitoring,
        automated deployments, and comprehensive security. Scales from startup
        to enterprise with robust performance metrics.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
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
