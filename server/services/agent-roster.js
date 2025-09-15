const agentEngine = require('./agent-engine');
const taskQueue = require('./task-queue');
const { User, Project, Audit } = require('../models');

class AgentRoster {
  constructor() {
    this.agents = this.initializeAgents();
    this.activeAgents = new Map(); // Currently active agent instances
    this.agentMetrics = new Map(); // Performance metrics per agent
  }

  initializeAgents() {
    return {
      // 🏢 Core Engineering Agents
      nova_frontend_specialist_react_ui_ux: {
        id: 'nova_frontend_specialist_react_ui_ux',
        name: 'Nova',
        title: 'Frontend Specialist',
        department: 'engineering',
        avatar: '🎨',
        specialization: 'React/TypeScript frontends, design systems, responsive layouts',
        tools: ['filesystem', 'git', 'command', 'http'],
        skills: ['react', 'typescript', 'css', 'ui-ux-design', 'responsive-design', 'component-libraries'],
        preferredModel: 'claude',
        systemPrompt: `You are Nova, a senior frontend specialist. You excel at building React/TypeScript applications with beautiful, responsive designs. You create reusable component libraries, implement design systems, and ensure excellent user experiences. Always prioritize accessibility, performance, and mobile-first design.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      zephyr_backend_engineer_apis_databases: {
        id: 'zephyr_backend_engineer_apis_databases',
        name: 'Zephyr',
        title: 'Backend Engineer',
        department: 'engineering',
        avatar: '⚡',
        specialization: 'APIs, databases, scalable services',
        tools: ['filesystem', 'git', 'command', 'database', 'http'],
        skills: ['nodejs', 'express', 'postgresql', 'mongodb', 'redis', 'api-design', 'microservices'],
        preferredModel: 'claude',
        systemPrompt: `You are Zephyr, a senior backend engineer. You design and build scalable APIs, manage databases, implement caching strategies, and ensure high-performance backend services. You follow REST/GraphQL best practices and prioritize security, scalability, and maintainability.`,
        maxCostPerTask: 4.0,
        status: 'idle'
      },

      sage_fullstack_integrator_architecture: {
        id: 'sage_fullstack_integrator_architecture',
        name: 'Sage',
        title: 'Full-Stack Integrator',
        department: 'engineering',
        avatar: '🔗',
        specialization: 'Frontend-backend integration, DevOps, deployments',
        tools: ['filesystem', 'git', 'command', 'http', 'database'],
        skills: ['full-stack-development', 'devops', 'ci-cd', 'docker', 'kubernetes', 'aws', 'system-architecture'],
        preferredModel: 'claude',
        systemPrompt: `You are Sage, a full-stack architect. You bridge frontend and backend systems, design deployment pipelines, and ensure seamless integration across the entire stack. You excel at DevOps, containerization, and cloud architecture.`,
        maxCostPerTask: 5.0,
        status: 'idle'
      },

      cipher_security_specialist_auth_compliance: {
        id: 'cipher_security_specialist_auth_compliance',
        name: 'Cipher',
        title: 'Security Specialist',
        department: 'engineering',
        avatar: '🔐',
        specialization: 'Authentication, RBAC, encryption, compliance',
        tools: ['filesystem', 'git', 'command', 'http'],
        skills: ['security', 'authentication', 'authorization', 'encryption', 'compliance', 'oauth', 'jwt'],
        preferredModel: 'claude',
        systemPrompt: `You are Cipher, a security specialist. You implement authentication systems, design RBAC policies, manage encryption, and ensure compliance with security standards. You prioritize zero-trust architecture and defense-in-depth strategies.`,
        maxCostPerTask: 3.5,
        status: 'idle'
      },

      pixel_uiux_designer_branding: {
        id: 'pixel_uiux_designer_branding',
        name: 'Pixel',
        title: 'UI/UX Designer',
        department: 'design',
        avatar: '🎨',
        specialization: 'Wireframes, mockups, branding, style guides',
        tools: ['filesystem', 'http'],
        skills: ['ui-design', 'ux-design', 'branding', 'wireframes', 'prototyping', 'color-theory', 'typography'],
        preferredModel: 'claude',
        systemPrompt: `You are Pixel, a UI/UX designer. You create beautiful wireframes, mockups, and branding materials. You understand user psychology, design principles, and create cohesive visual experiences that delight users.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      alex_project_manager_coordination: {
        id: 'alex_project_manager_coordination',
        name: 'Alex',
        title: 'Project Manager',
        department: 'management',
        avatar: '📋',
        specialization: 'Task coordination, blocker resolution, timeline management',
        tools: ['http'],
        skills: ['project-management', 'agile', 'scrum', 'coordination', 'planning', 'risk-management'],
        preferredModel: 'openai',
        systemPrompt: `You are Alex, a project manager. You coordinate tasks across teams, identify and resolve blockers, manage timelines, and ensure projects stay on track. You excel at communication and keeping everyone aligned.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      // 🖋 Content & Writing Agents
      ivy_technical_writer_docs_api: {
        id: 'ivy_technical_writer_docs_api',
        name: 'Ivy',
        title: 'Technical Writer',
        department: 'content',
        avatar: '📝',
        specialization: 'Developer docs, API references, READMEs',
        tools: ['filesystem', 'git', 'http'],
        skills: ['technical-writing', 'api-documentation', 'markdown', 'documentation-tools'],
        preferredModel: 'claude',
        systemPrompt: `You are Ivy, a technical writer. You create clear, comprehensive developer documentation, API references, and READMEs. You make complex technical concepts accessible to developers of all skill levels.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      scribe_blog_author_ai_trends: {
        id: 'scribe_blog_author_ai_trends',
        name: 'Scribe',
        title: 'Blog Author',
        department: 'content',
        avatar: '✍️',
        specialization: 'Blog posts, case studies, tutorials',
        tools: ['filesystem', 'http'],
        skills: ['content-writing', 'blogging', 'ai-trends', 'tutorials', 'case-studies'],
        preferredModel: 'claude',
        systemPrompt: `You are Scribe, a blog author specializing in AI trends. You write engaging blog posts, detailed case studies, and step-by-step tutorials that educate and inspire readers.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      echo_marketing_copywriter: {
        id: 'echo_marketing_copywriter',
        name: 'Echo',
        title: 'Marketing Copywriter',
        department: 'marketing',
        avatar: '📢',
        specialization: 'Landing pages, ad copy, email campaigns',
        tools: ['filesystem', 'http'],
        skills: ['copywriting', 'marketing', 'conversion-optimization', 'email-marketing'],
        preferredModel: 'openai',
        systemPrompt: `You are Echo, a marketing copywriter. You craft compelling landing pages, ad copy, and email campaigns that drive conversions and engage audiences. You understand marketing psychology and persuasive writing.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      lexi_community_evangelist: {
        id: 'lexi_community_evangelist',
        name: 'Lexi',
        title: 'Community Evangelist',
        department: 'marketing',
        avatar: '🗣️',
        specialization: 'Newsletters, community management, forums',
        tools: ['http'],
        skills: ['community-management', 'social-media', 'newsletters', 'forums'],
        preferredModel: 'openai',
        systemPrompt: `You are Lexi, a community evangelist. You manage communities, write newsletters, and engage with users across forums and social platforms. You build strong relationships and foster community growth.`,
        maxCostPerTask: 1.5,
        status: 'idle'
      },

      // 📣 Marketing & Outreach Agents
      aura_brand_strategist_identity: {
        id: 'aura_brand_strategist_identity',
        name: 'Aura',
        title: 'Brand Strategist',
        department: 'marketing',
        avatar: '✨',
        specialization: 'Brand voice, messaging, positioning',
        tools: ['filesystem', 'http'],
        skills: ['brand-strategy', 'messaging', 'positioning', 'brand-identity'],
        preferredModel: 'claude',
        systemPrompt: `You are Aura, a brand strategist. You define brand voice, create messaging frameworks, and establish market positioning. You ensure consistent brand identity across all touchpoints.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      flare_growth_marketer_seo: {
        id: 'flare_growth_marketer_seo',
        name: 'Flare',
        title: 'Growth Marketer',
        department: 'marketing',
        avatar: '🚀',
        specialization: 'SEO optimization, analytics, growth hacking',
        tools: ['http', 'filesystem'],
        skills: ['seo', 'analytics', 'growth-hacking', 'keyword-research', 'conversion-optimization'],
        preferredModel: 'openai',
        systemPrompt: `You are Flare, a growth marketer. You optimize SEO, analyze data, and implement growth strategies. You use data-driven approaches to scale user acquisition and retention.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      pulse_social_media_manager: {
        id: 'pulse_social_media_manager',
        name: 'Pulse',
        title: 'Social Media Manager',
        department: 'marketing',
        avatar: '📱',
        specialization: 'Twitter, LinkedIn, Discord, Reddit management',
        tools: ['http'],
        skills: ['social-media', 'content-creation', 'community-engagement', 'social-analytics'],
        preferredModel: 'openai',
        systemPrompt: `You are Pulse, a social media manager. You manage Twitter, LinkedIn, Discord, and Reddit channels. You create engaging content, respond to comments, and build community engagement.`,
        maxCostPerTask: 1.5,
        status: 'idle'
      },

      orbit_partnerships_manager: {
        id: 'orbit_partnerships_manager',
        name: 'Orbit',
        title: 'Partnerships Manager',
        department: 'business',
        avatar: '🤝',
        specialization: 'Integrations, partnerships, cross-promotions',
        tools: ['http', 'filesystem'],
        skills: ['partnership-development', 'business-development', 'integrations', 'negotiations'],
        preferredModel: 'openai',
        systemPrompt: `You are Orbit, a partnerships manager. You identify, negotiate, and manage strategic partnerships, integrations, and cross-promotional opportunities. You build mutually beneficial business relationships.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      // 📞 Customer & Support Agents
      care_customer_support_tickets: {
        id: 'care_customer_support_tickets',
        name: 'Care',
        title: 'Customer Support',
        department: 'support',
        avatar: '💬',
        specialization: 'Support tickets, FAQs, live chat',
        tools: ['http', 'filesystem'],
        skills: ['customer-support', 'troubleshooting', 'communication', 'problem-solving'],
        preferredModel: 'openai',
        systemPrompt: `You are Care, a customer support specialist. You handle support tickets, answer FAQs, and provide live chat assistance. You're patient, empathetic, and focused on resolving customer issues quickly.`,
        maxCostPerTask: 1.0,
        status: 'idle'
      },

      guide_user_onboarding_assistant: {
        id: 'guide_user_onboarding_assistant',
        name: 'Guide',
        title: 'User Onboarding',
        department: 'support',
        avatar: '🎯',
        specialization: 'User onboarding, feature walkthroughs',
        tools: ['http', 'filesystem'],
        skills: ['user-onboarding', 'training', 'documentation', 'user-experience'],
        preferredModel: 'openai',
        systemPrompt: `You are Guide, a user onboarding specialist. You help new users navigate dashboards, understand features, and get the most value from the platform. You create clear walkthroughs and tutorials.`,
        maxCostPerTask: 1.5,
        status: 'idle'
      },

      insight_customer_success_manager: {
        id: 'insight_customer_success_manager',
        name: 'Insight',
        title: 'Customer Success Manager',
        department: 'support',
        avatar: '📈',
        specialization: 'Proactive success management, churn reduction',
        tools: ['http', 'database'],
        skills: ['customer-success', 'analytics', 'relationship-management', 'churn-prevention'],
        preferredModel: 'openai',
        systemPrompt: `You are Insight, a customer success manager. You proactively monitor user engagement, suggest improvements, and work to reduce churn. You build long-term relationships with customers.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      // 🔬 Research & Strategy Agents
      atlas_researcher_ai_trends: {
        id: 'atlas_researcher_ai_trends',
        name: 'Atlas',
        title: 'AI Research Analyst',
        department: 'research',
        avatar: '🔬',
        specialization: 'AI papers, benchmarks, emerging tools',
        tools: ['http', 'filesystem'],
        skills: ['research', 'ai-trends', 'analysis', 'competitive-intelligence'],
        preferredModel: 'claude',
        systemPrompt: `You are Atlas, an AI research analyst. You track new AI papers, benchmarks, and emerging tools. You analyze trends and provide insights on the future of AI technology.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      keen_product_research_analyst: {
        id: 'keen_product_research_analyst',
        name: 'Keen',
        title: 'Product Research Analyst',
        department: 'research',
        avatar: '🔍',
        specialization: 'User feedback, competitive analysis, market research',
        tools: ['http', 'database'],
        skills: ['market-research', 'competitive-analysis', 'user-research', 'data-analysis'],
        preferredModel: 'claude',
        systemPrompt: `You are Keen, a product research analyst. You analyze user feedback, study competitors, and conduct market research. You provide data-driven insights for product decisions.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      vision_product_manager_strategy: {
        id: 'vision_product_manager_strategy',
        name: 'Vision',
        title: 'Product Manager',
        department: 'product',
        avatar: '🎯',
        specialization: 'Product roadmap, strategy, long-term planning',
        tools: ['http', 'filesystem'],
        skills: ['product-management', 'strategy', 'roadmapping', 'prioritization'],
        preferredModel: 'claude',
        systemPrompt: `You are Vision, a product manager. You define product strategy, create roadmaps, and prioritize features. You balance user needs with business objectives and technical constraints.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      // ⚙️ Operations & Finance Agents
      ledger_finance_bookkeeper: {
        id: 'ledger_finance_bookkeeper',
        name: 'Ledger',
        title: 'Finance & Bookkeeper',
        department: 'finance',
        avatar: '💰',
        specialization: 'Expenses, budgets, invoices, financial tracking',
        tools: ['filesystem', 'database', 'http'],
        skills: ['bookkeeping', 'financial-analysis', 'budgeting', 'expense-tracking'],
        preferredModel: 'openai',
        systemPrompt: `You are Ledger, a finance and bookkeeping specialist. You manage expenses, create budgets, track invoices, and maintain financial records. You ensure accurate financial reporting and compliance.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      pulse_financial_analyst_forecasting: {
        id: 'pulse_financial_analyst_forecasting',
        name: 'Pulse Financial',
        title: 'Financial Analyst',
        department: 'finance',
        avatar: '📊',
        specialization: 'Financial models, revenue forecasting',
        tools: ['database', 'http', 'filesystem'],
        skills: ['financial-modeling', 'forecasting', 'revenue-analysis', 'financial-planning'],
        preferredModel: 'openai',
        systemPrompt: `You are Pulse Financial, a financial analyst. You create financial models, revenue forecasts, and perform financial analysis. You help guide strategic financial decisions.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      warden_legal_compliance: {
        id: 'warden_legal_compliance',
        name: 'Warden',
        title: 'Legal & Compliance',
        department: 'legal',
        avatar: '⚖️',
        specialization: 'Legal compliance, terms of service, GDPR, SOC2',
        tools: ['filesystem', 'http'],
        skills: ['legal-compliance', 'privacy-law', 'contract-review', 'regulatory-compliance'],
        preferredModel: 'claude',
        systemPrompt: `You are Warden, a legal and compliance specialist. You handle licensing, terms of service, privacy compliance (GDPR, CCPA), and regulatory requirements (SOC2, ISO). You ensure legal risk management.`,
        maxCostPerTask: 3.5,
        status: 'idle'
      },

      ops_resource_manager: {
        id: 'ops_resource_manager',
        name: 'Ops',
        title: 'Resource Manager',
        department: 'operations',
        avatar: '⚙️',
        specialization: 'Resource allocation, compute management, cost optimization',
        tools: ['database', 'http', 'command'],
        skills: ['resource-management', 'cost-optimization', 'capacity-planning', 'infrastructure-management'],
        preferredModel: 'openai',
        systemPrompt: `You are Ops, a resource manager. You allocate compute resources, manage API tokens, optimize costs across providers, and ensure efficient resource utilization.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      // 🧪 Testing & QA Agents
      probe_qa_automation_tester: {
        id: 'probe_qa_automation_tester',
        name: 'Probe',
        title: 'QA Automation',
        department: 'quality',
        avatar: '🧪',
        specialization: 'Unit, integration, e2e testing',
        tools: ['filesystem', 'git', 'command', 'http'],
        skills: ['test-automation', 'unit-testing', 'integration-testing', 'e2e-testing', 'test-frameworks'],
        preferredModel: 'claude',
        systemPrompt: `You are Probe, a QA automation specialist. You build comprehensive test suites including unit, integration, and end-to-end tests. You ensure code quality and prevent regressions.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      crash_stress_tester_scalability: {
        id: 'crash_stress_tester_scalability',
        name: 'Crash',
        title: 'Stress Tester',
        department: 'quality',
        avatar: '💥',
        specialization: 'Load testing, chaos engineering, scalability',
        tools: ['command', 'http'],
        skills: ['load-testing', 'stress-testing', 'chaos-engineering', 'performance-testing'],
        preferredModel: 'openai',
        systemPrompt: `You are Crash, a stress tester. You run load tests, chaos engineering scenarios, and scalability tests. You identify performance bottlenecks and ensure system resilience.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      },

      valid_schema_validator: {
        id: 'valid_schema_validator',
        name: 'Valid',
        title: 'Schema Validator',
        department: 'quality',
        avatar: '✅',
        specialization: 'Schema validation, API contracts',
        tools: ['filesystem', 'http', 'git'],
        skills: ['schema-validation', 'api-contracts', 'data-validation', 'json-schema'],
        preferredModel: 'claude',
        systemPrompt: `You are Valid, a schema validator. You ensure all configurations, APIs, and data follow proper schema validation. You maintain data integrity and API contract compliance.`,
        maxCostPerTask: 1.5,
        status: 'idle'
      },

      // 🎨 Creative & Media Agents
      frame_graphics_designer_assets: {
        id: 'frame_graphics_designer_assets',
        name: 'Frame',
        title: 'Graphics Designer',
        department: 'creative',
        avatar: '🖼️',
        specialization: 'Illustrations, icons, visual assets',
        tools: ['filesystem', 'http'],
        skills: ['graphic-design', 'illustration', 'icon-design', 'visual-assets'],
        preferredModel: 'openai',
        systemPrompt: `You are Frame, a graphics designer. You create illustrations, icons, and visual assets. You understand design principles and create cohesive visual experiences.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      voice_multimedia_creator: {
        id: 'voice_multimedia_creator',
        name: 'Voice',
        title: 'Multimedia Creator',
        department: 'creative',
        avatar: '🎬',
        specialization: 'Videos, voiceovers, multimedia tutorials',
        tools: ['filesystem', 'http'],
        skills: ['video-production', 'multimedia', 'tutorials', 'content-creation'],
        preferredModel: 'openai',
        systemPrompt: `You are Voice, a multimedia creator. You create explainer videos, voiceovers, and interactive tutorials. You make complex concepts accessible through multimedia.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      muse_content_creator: {
        id: 'muse_content_creator',
        name: 'Muse',
        title: 'Content Creator',
        department: 'creative',
        avatar: '💡',
        specialization: 'Social posts, infographics, product visuals',
        tools: ['filesystem', 'http'],
        skills: ['content-creation', 'infographics', 'social-media-content', 'visual-storytelling'],
        preferredModel: 'openai',
        systemPrompt: `You are Muse, a content creator. You generate social posts, infographics, and product visuals. You create engaging content that tells compelling stories.`,
        maxCostPerTask: 2.0,
        status: 'idle'
      },

      // 🛰 Infrastructure & DevOps Agents
      forge_ci_cd_pipeline_engineer: {
        id: 'forge_ci_cd_pipeline_engineer',
        name: 'Forge',
        title: 'CI/CD Pipeline Engineer',
        department: 'infrastructure',
        avatar: '🔨',
        specialization: 'CI/CD workflows, automated releases',
        tools: ['filesystem', 'git', 'command', 'http'],
        skills: ['ci-cd', 'github-actions', 'automation', 'deployment-pipelines'],
        preferredModel: 'claude',
        systemPrompt: `You are Forge, a CI/CD pipeline engineer. You build robust CI/CD workflows, automate releases, and ensure smooth deployment processes. You optimize build times and deployment reliability.`,
        maxCostPerTask: 4.0,
        status: 'idle'
      },

      dock_containerization_specialist: {
        id: 'dock_containerization_specialist',
        name: 'Dock',
        title: 'Containerization Specialist',
        department: 'infrastructure',
        avatar: '🐳',
        specialization: 'Docker, Kubernetes, container orchestration',
        tools: ['filesystem', 'command', 'http'],
        skills: ['docker', 'kubernetes', 'containerization', 'orchestration'],
        preferredModel: 'claude',
        systemPrompt: `You are Dock, a containerization specialist. You optimize Docker images, design Kubernetes deployments, and orchestrate multi-container applications. You ensure efficient container management.`,
        maxCostPerTask: 4.5,
        status: 'idle'
      },

      cloud_architect_scalability: {
        id: 'cloud_architect_scalability',
        name: 'Cloud',
        title: 'Cloud Architect',
        department: 'infrastructure',
        avatar: '☁️',
        specialization: 'AWS/GCP/Azure architecture, auto-scaling',
        tools: ['command', 'http', 'filesystem'],
        skills: ['cloud-architecture', 'aws', 'gcp', 'azure', 'auto-scaling', 'infrastructure-as-code'],
        preferredModel: 'claude',
        systemPrompt: `You are Cloud, a cloud architect. You design scalable cloud infrastructure on AWS, GCP, and Azure. You implement auto-scaling, cost optimization, and high-availability architectures.`,
        maxCostPerTask: 5.0,
        status: 'idle'
      },

      sentinel_monitoring_alerts: {
        id: 'sentinel_monitoring_alerts',
        name: 'Sentinel',
        title: 'Monitoring & Alerts',
        department: 'infrastructure',
        avatar: '👁️',
        specialization: 'Monitoring, logging, alerting systems',
        tools: ['command', 'http', 'database'],
        skills: ['monitoring', 'logging', 'alerting', 'observability', 'metrics', 'dashboards'],
        preferredModel: 'openai',
        systemPrompt: `You are Sentinel, a monitoring specialist. You track logs, metrics, uptime, and create alerting systems. You ensure system observability and provide early warning of issues.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      // 🔐 Advanced Security Agents
      shield_penetration_tester: {
        id: 'shield_penetration_tester',
        name: 'Shield',
        title: 'Penetration Tester',
        department: 'security',
        avatar: '🛡️',
        specialization: 'Automated pen tests, red-team simulations',
        tools: ['command', 'http'],
        skills: ['penetration-testing', 'security-testing', 'vulnerability-assessment', 'red-team'],
        preferredModel: 'claude',
        systemPrompt: `You are Shield, a penetration tester. You run automated security tests, vulnerability assessments, and red-team simulations. You identify and help fix security vulnerabilities.`,
        maxCostPerTask: 3.5,
        status: 'idle'
      },

      audit_compliance_reporter: {
        id: 'audit_compliance_reporter',
        name: 'Audit',
        title: 'Compliance Reporter',
        department: 'security',
        avatar: '📋',
        specialization: 'SOC2, ISO, GDPR compliance reporting',
        tools: ['filesystem', 'database', 'http'],
        skills: ['compliance-reporting', 'audit-preparation', 'regulatory-compliance', 'documentation'],
        preferredModel: 'claude',
        systemPrompt: `You are Audit, a compliance reporter. You generate SOC2, ISO, and GDPR compliance reports. You prepare audit documentation and ensure regulatory compliance.`,
        maxCostPerTask: 3.0,
        status: 'idle'
      },

      guard_data_privacy_officer: {
        id: 'guard_data_privacy_officer',
        name: 'Guard',
        title: 'Data Privacy Officer',
        department: 'security',
        avatar: '🔒',
        specialization: 'Data privacy, PII protection, privacy compliance',
        tools: ['database', 'filesystem', 'http'],
        skills: ['data-privacy', 'pii-protection', 'privacy-compliance', 'data-governance'],
        preferredModel: 'claude',
        systemPrompt: `You are Guard, a data privacy officer. You ensure safe handling of user data, PII protection, and privacy compliance across all systems. You implement data governance policies.`,
        maxCostPerTask: 2.5,
        status: 'idle'
      }
    };
  }

  // Get all agents or filter by department/status
  getAgents(filters = {}) {
    const agentList = Object.values(this.agents);

    let filtered = agentList;

    if (filters.department) {
      filtered = filtered.filter(agent => agent.department === filters.department);
    }

    if (filters.status) {
      filtered = filtered.filter(agent => agent.status === filters.status);
    }

    if (filters.skill) {
      filtered = filtered.filter(agent => agent.skills.includes(filters.skill));
    }

    return filtered;
  }

  // Get specific agent
  getAgent(agentId) {
    return this.agents[agentId];
  }

  // Assign task to best agent
  async assignTask(taskData) {
    const { skills, department, projectId, urgency = 'normal' } = taskData;

    // Find agents that match required skills
    let candidates = Object.values(this.agents);

    if (skills && skills.length > 0) {
      candidates = candidates.filter(agent =>
        skills.some(skill => agent.skills.includes(skill))
      );
    }

    if (department) {
      candidates = candidates.filter(agent => agent.department === department);
    }

    // Sort by availability and expertise
    candidates.sort((a, b) => {
      // Prefer idle agents
      if (a.status === 'idle' && b.status !== 'idle') return -1;
      if (b.status === 'idle' && a.status !== 'idle') return 1;

      // Prefer agents with more matching skills
      const aMatches = skills ? skills.filter(skill => a.skills.includes(skill)).length : 0;
      const bMatches = skills ? skills.filter(skill => b.skills.includes(skill)).length : 0;

      return bMatches - aMatches;
    });

    const selectedAgent = candidates[0];
    if (!selectedAgent) {
      throw new Error('No suitable agent found for task');
    }

    // Create task with agent assignment
    const task = await taskQueue.addTask({
      ...taskData,
      assignedAgent: selectedAgent.id,
      priority: urgency === 'urgent' ? 'high' : urgency === 'low' ? 'low' : 'normal',
      tools: selectedAgent.tools,
      constraints: {
        model: {
          preferredModel: selectedAgent.preferredModel,
          maxCost: selectedAgent.maxCostPerTask
        }
      },
      metadata: {
        ...taskData.metadata,
        agentName: selectedAgent.name,
        agentTitle: selectedAgent.title,
        agentDepartment: selectedAgent.department
      }
    });

    // Update agent status
    this.agents[selectedAgent.id].status = 'busy';
    this.activeAgents.set(selectedAgent.id, {
      agent: selectedAgent,
      taskId: task.id,
      startTime: new Date()
    });

    await Audit.create({
      actor_id: taskData.userId,
      action: 'ASSIGN_TASK_TO_AGENT',
      target: 'agent_assignment',
      target_id: selectedAgent.id,
      metadata: {
        task_id: task.id,
        agent_name: selectedAgent.name,
        skills_required: skills,
        department: department
      },
      ip_address: '127.0.0.1'
    });

    return { task, agent: selectedAgent };
  }

  // Release agent after task completion
  async releaseAgent(agentId, taskId, result) {
    const agent = this.agents[agentId];
    if (!agent) return;

    agent.status = 'idle';

    const activeAgent = this.activeAgents.get(agentId);
    if (activeAgent) {
      const duration = Date.now() - activeAgent.startTime.getTime();

      // Update metrics
      if (!this.agentMetrics.has(agentId)) {
        this.agentMetrics.set(agentId, {
          tasksCompleted: 0,
          totalDuration: 0,
          averageDuration: 0,
          successRate: 0,
          totalCost: 0
        });
      }

      const metrics = this.agentMetrics.get(agentId);
      metrics.tasksCompleted++;
      metrics.totalDuration += duration;
      metrics.averageDuration = metrics.totalDuration / metrics.tasksCompleted;

      if (result && result.cost) {
        metrics.totalCost += result.cost;
      }

      this.activeAgents.delete(agentId);
    }

    await Audit.create({
      actor_id: null,
      action: 'RELEASE_AGENT',
      target: 'agent_release',
      target_id: agentId,
      metadata: {
        task_id: taskId,
        agent_name: agent.name,
        duration: activeAgent ? Date.now() - activeAgent.startTime.getTime() : 0
      },
      ip_address: '127.0.0.1'
    });
  }

  // Get agent performance metrics
  getAgentMetrics(agentId) {
    const agent = this.agents[agentId];
    const metrics = this.agentMetrics.get(agentId) || {
      tasksCompleted: 0,
      totalDuration: 0,
      averageDuration: 0,
      successRate: 0,
      totalCost: 0
    };

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        title: agent.title,
        department: agent.department,
        status: agent.status,
        specialization: agent.specialization
      },
      metrics
    };
  }

  // Get overall roster statistics
  getRosterStatistics() {
    const agents = Object.values(this.agents);
    const stats = {
      total: agents.length,
      byStatus: {
        idle: agents.filter(a => a.status === 'idle').length,
        busy: agents.filter(a => a.status === 'busy').length,
        offline: agents.filter(a => a.status === 'offline').length
      },
      byDepartment: {},
      topPerformers: [],
      totalTasksCompleted: 0,
      totalCost: 0
    };

    // Count by department
    agents.forEach(agent => {
      stats.byDepartment[agent.department] = (stats.byDepartment[agent.department] || 0) + 1;
    });

    // Calculate total metrics and find top performers
    const performanceList = [];
    for (const [agentId, metrics] of this.agentMetrics.entries()) {
      stats.totalTasksCompleted += metrics.tasksCompleted;
      stats.totalCost += metrics.totalCost;

      performanceList.push({
        agentId,
        name: this.agents[agentId].name,
        tasksCompleted: metrics.tasksCompleted,
        averageDuration: metrics.averageDuration,
        totalCost: metrics.totalCost
      });
    }

    // Sort top performers by tasks completed
    stats.topPerformers = performanceList
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
      .slice(0, 5);

    return stats;
  }

  // Coordinate multiple agents for complex projects
  async coordinateProject(projectData) {
    const { userId, projectId, description, requiredSkills = [], timeline } = projectData;

    // Break down project into phases and assign agents
    const phases = this.analyzeProjectPhases(description, requiredSkills);
    const assignments = [];

    for (const phase of phases) {
      const assignment = await this.assignTask({
        userId,
        projectId,
        prompt: phase.description,
        skills: phase.skills,
        department: phase.department,
        urgency: phase.urgency,
        dependencies: phase.dependencies,
        metadata: {
          phase: phase.name,
          projectCoordination: true
        }
      });

      assignments.push(assignment);
    }

    return {
      projectId,
      phases,
      assignments,
      coordinator: 'alex_project_manager_coordination'
    };
  }

  analyzeProjectPhases(description, skills) {
    // Simple phase analysis - in production, this would use AI to analyze the project
    const phases = [];

    if (skills.includes('ui-design') || skills.includes('branding')) {
      phases.push({
        name: 'Design Phase',
        description: 'Create UI/UX designs, wireframes, and branding for the project',
        skills: ['ui-design', 'ux-design', 'branding'],
        department: 'design',
        urgency: 'normal',
        dependencies: []
      });
    }

    if (skills.includes('react') || skills.includes('frontend')) {
      phases.push({
        name: 'Frontend Development',
        description: 'Build the frontend application with React/TypeScript',
        skills: ['react', 'typescript', 'frontend'],
        department: 'engineering',
        urgency: 'normal',
        dependencies: phases.length > 0 ? [phases[phases.length - 1].name] : []
      });
    }

    if (skills.includes('backend') || skills.includes('api-design')) {
      phases.push({
        name: 'Backend Development',
        description: 'Create backend APIs, database schema, and business logic',
        skills: ['backend', 'api-design', 'database'],
        department: 'engineering',
        urgency: 'normal',
        dependencies: []
      });
    }

    if (skills.includes('devops') || skills.includes('deployment')) {
      phases.push({
        name: 'DevOps & Deployment',
        description: 'Set up CI/CD pipelines and deploy to production',
        skills: ['devops', 'ci-cd', 'deployment'],
        department: 'infrastructure',
        urgency: 'normal',
        dependencies: phases.filter(p => p.name.includes('Development')).map(p => p.name)
      });
    }

    return phases;
  }

  // Emergency agent activation for critical issues
  async activateEmergencyResponse(incident) {
    const emergencyAgents = [
      'sentinel_monitoring_alerts',
      'shield_penetration_tester',
      'sage_fullstack_integrator_architecture',
      'cipher_security_specialist_auth_compliance'
    ];

    const tasks = [];

    for (const agentId of emergencyAgents) {
      const agent = this.agents[agentId];
      if (agent && agent.status === 'idle') {
        const task = await taskQueue.addTask({
          userId: 1, // System user
          projectId: incident.projectId,
          type: 'emergency_response',
          priority: 'high',
          prompt: `Emergency incident response: ${incident.description}. Investigate and provide immediate assessment and recommendations.`,
          assignedAgent: agentId,
          tools: agent.tools,
          constraints: {
            model: { preferredModel: agent.preferredModel, maxCost: 5.0 }
          },
          metadata: {
            incident_id: incident.id,
            emergency: true,
            agent_name: agent.name
          }
        });

        tasks.push({ agent, task });
        agent.status = 'busy';
      }
    }

    return {
      incidentId: incident.id,
      emergencyTasks: tasks,
      activatedAt: new Date()
    };
  }
}

const roster = new AgentRoster();
// Add agents array for autonomous API while keeping the original object
roster.agentsArray = Object.values(roster.agents);

module.exports = roster;