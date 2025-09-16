import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'ShellCompany Documentation',
  tagline: 'Autonomous AI Company Platform - Complete Technical Documentation',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,
  },

  url: 'https://bradleymatera.github.io',
  baseUrl: '/ShellCompany/',

  // GitHub pages deployment config
  organizationName: 'BradleyMatera',
  projectName: 'ShellCompany',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/BradleyMatera/ShellCompany/tree/main/docs-site/',
        },
        blog: false, // Disable blog for now
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/shellcompany-social-card.jpg',
    navbar: {
      title: 'ShellCompany Docs',
      logo: {
        alt: 'ShellCompany Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'dropdown',
          label: 'Quick Links',
          position: 'left',
          items: [
            {
              label: 'Architecture Overview',
              to: '/architecture/overview',
            },
            {
              label: 'Agents Overview',
              to: '/agents/overview',
            },
            {
              label: 'Workflow Lifecycle',
              to: '/workflows/lifecycle',
            },
            {
              label: 'Tech Stack',
              to: '/architecture/tech-stack',
            },
          ],
        },
        {
          href: 'https://github.com/BradleyMatera/ShellCompany',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Architecture',
          items: [
            {
              label: 'Overview',
              to: '/architecture/overview',
            },
            {
              label: 'Tech Stack',
              to: '/architecture/tech-stack',
            },
          ],
        },
        {
          title: 'Agents & Workflows',
          items: [
            {
              label: 'Agent Overview',
              to: '/agents/overview',
            },
            {
              label: 'Workflow Lifecycle',
              to: '/workflows/lifecycle',
            },
          ],
        },
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/',
            },
            {
              label: 'Introduction',
              to: '/intro',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/BradleyMatera/ShellCompany',
            },
            {
              label: 'Issues',
              href: 'https://github.com/BradleyMatera/ShellCompany/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ShellCompany. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'diff', 'json', 'javascript', 'typescript', 'jsx', 'tsx'],
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
