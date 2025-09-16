import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    'index',
    {
      type: 'category',
      label: '🏗️ System Architecture',
      items: [
        'architecture/overview',
        'architecture/tech-stack',
      ],
    },
    {
      type: 'category',
      label: '🔄 Workflows & Processes',
      items: [
        'workflows/lifecycle',
      ],
    },
    {
      type: 'category',
      label: '🤖 Agents & Company Structure',
      items: [
        'agents/overview',
      ],
    },
    // Placeholder categories for future docs
    {
      type: 'category',
      label: '⚙️ Engines & Core Services',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '🎨 UI & User Experience',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '🗄️ Data & Persistence',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '📊 Metrics & Monitoring',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '🔧 API Reference',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '📁 File Documentation',
      items: [
        'intro', // Temporary placeholder
      ],
    },
    {
      type: 'category',
      label: '🚀 Deployment & Operations',
      items: [
        'intro', // Temporary placeholder
      ],
    },
  ],
};

export default sidebars;
