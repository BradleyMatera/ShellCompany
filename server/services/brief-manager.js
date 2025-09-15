const { v4: uuidv4 } = require('uuid');

class BriefManager {
  constructor() {
    this.activeBriefs = new Map();
    this.completedBriefs = new Map();
  }

  /**
   * Analyze directive and generate clarifying questions
   */
  async analyzeDirective(directive, userId = 'user') {
    const briefId = uuidv4();
    
    const analysis = await this.performDirectiveAnalysis(directive);
    
    const brief = {
      id: briefId,
      userId,
      originalDirective: directive,
      timestamp: new Date(),
      status: 'clarifying',
      analysis,
      knownFacts: analysis.knownFacts,
      assumptions: analysis.assumptions,
      unknowns: analysis.unknowns,
      clarifyingQuestions: analysis.clarifyingQuestions,
      responses: new Map(),
      completedBrief: null,
      estimatedComplexity: analysis.complexity,
      suggestedAgents: analysis.suggestedAgents
    };

    this.activeBriefs.set(briefId, brief);
    
    console.log(`[BRIEF:${briefId}] Analyzed directive: "${directive}"`);
    console.log(`[BRIEF:${briefId}] Generated ${analysis.clarifyingQuestions.length} clarifying questions`);
    
    return brief;
  }

  /**
   * AI-powered directive analysis to extract what we know and what we need
   */
  async performDirectiveAnalysis(directive) {
    const lowerDirective = directive.toLowerCase();
    
    // Analyze directive type and extract known information
    let projectType = 'general';
    let knownFacts = [];
    let assumptions = [];
    let unknowns = [];
    let clarifyingQuestions = [];
    let complexity = 'medium';
    let suggestedAgents = [];

    // Project type detection
    if (lowerDirective.includes('website') || lowerDirective.includes('landing page') || lowerDirective.includes('web')) {
      projectType = 'website';
      suggestedAgents = ['Alex', 'Pixel', 'Nova', 'Sage'];
    } else if (lowerDirective.includes('dashboard') || lowerDirective.includes('monitoring') || lowerDirective.includes('analytics')) {
      projectType = 'dashboard';
      suggestedAgents = ['Alex', 'Nova', 'Pixel', 'Zephyr'];
    } else if (lowerDirective.includes('api') || lowerDirective.includes('backend') || lowerDirective.includes('server')) {
      projectType = 'backend';
      suggestedAgents = ['Alex', 'Zephyr', 'Cipher', 'Sage'];
    } else if (lowerDirective.includes('app') || lowerDirective.includes('application')) {
      projectType = 'fullstack';
      suggestedAgents = ['Alex', 'Nova', 'Zephyr', 'Pixel', 'Cipher', 'Sage'];
      complexity = 'high';
    }

    // Extract known facts from directive
    knownFacts.push(`Project type: ${projectType}`);
    knownFacts.push(`Original request: "${directive}"`);

    // Target audience detection
    if (lowerDirective.includes('kitten') || lowerDirective.includes('pet') || lowerDirective.includes('animal')) {
      knownFacts.push('Target audience: Pet/animal lovers');
      knownFacts.push('Theme: Pet-focused/animal welfare');
    }

    // Feature detection
    if (lowerDirective.includes('onboarding')) {
      knownFacts.push('Required feature: User onboarding flow');
    }
    if (lowerDirective.includes('rescue')) {
      knownFacts.push('Context: Rescue/adoption service');
    }

    // Generate assumptions based on project type
    switch (projectType) {
      case 'website':
        assumptions = [
          'Responsive design for mobile and desktop',
          'Modern, clean visual design',
          'Basic SEO optimization needed',
          'Standard web technologies (HTML, CSS, JS)',
          'Single-page or multi-page structure'
        ];
        break;
      case 'dashboard':
        assumptions = [
          'Real-time data display required',
          'Interactive charts and metrics',
          'Admin/user role considerations',
          'Data visualization important',
          'Performance monitoring needed'
        ];
        break;
      case 'backend':
        assumptions = [
          'RESTful API design',
          'Database integration needed',
          'Authentication/authorization',
          'Error handling and logging',
          'Scalable architecture'
        ];
        break;
      case 'fullstack':
        assumptions = [
          'Frontend and backend integration',
          'Database design required',
          'User authentication system',
          'Responsive UI design',
          'Deployment strategy needed'
        ];
        complexity = 'high';
        break;
      default:
        assumptions = [
          'Standard development practices',
          'Documentation required',
          'Testing considerations',
          'Version control usage'
        ];
    }

    // Generate critical unknowns and questions
    unknowns = [
      'Target completion timeline',
      'Budget/resource constraints',
      'Specific success metrics',
      'Technical requirements/constraints',
      'Target user base size/characteristics'
    ];

    // Generate smart clarifying questions
    clarifyingQuestions = [
      {
        id: 'timeline',
        question: 'What is your target timeline for completion?',
        type: 'multiple-choice',
        options: ['Rush (1-2 hours)', 'Standard (Half day)', 'Thorough (Full day)', 'No specific deadline'],
        priority: 'high',
        impact: 'Affects resource allocation and quality depth'
      },
      {
        id: 'scope',
        question: 'What level of completion are you looking for?',
        type: 'multiple-choice', 
        options: ['Basic prototype/MVP', 'Production-ready version', 'Full-featured with extras', 'Just the core functionality'],
        priority: 'high',
        impact: 'Determines feature depth and polish level'
      }
    ];

    // Add project-specific questions
    if (projectType === 'website' || projectType === 'fullstack') {
      clarifyingQuestions.push({
        id: 'target_users',
        question: 'Who is the primary target audience?',
        type: 'multiple-choice',
        options: ['General public', 'Pet owners/adopters', 'Rescue organizations', 'Staff/volunteers', 'All of the above'],
        priority: 'medium',
        impact: 'Affects design, messaging, and feature priorities'
      });

      clarifyingQuestions.push({
        id: 'key_features',
        question: 'Which features are most important?',
        type: 'multiple-select',
        options: ['Pet browsing/search', 'Adoption application', 'Donation system', 'Volunteer registration', 'Success stories', 'Contact forms'],
        priority: 'medium',
        impact: 'Determines development priorities and agent assignments'
      });
    }

    if (projectType === 'dashboard') {
      clarifyingQuestions.push({
        id: 'metrics',
        question: 'What key metrics need to be displayed?',
        type: 'text',
        placeholder: 'e.g., adoption rates, donations, volunteer hours, etc.',
        priority: 'high',
        impact: 'Core functionality definition'
      });
    }

    // Success criteria question
    clarifyingQuestions.push({
      id: 'success_criteria',
      question: 'How will you know this project is successful?',
      type: 'text',
      placeholder: 'Describe what success looks like to you',
      priority: 'high',
      impact: 'Defines acceptance criteria and quality standards'
    });

    // Constraints question
    clarifyingQuestions.push({
      id: 'constraints',
      question: 'Are there any specific constraints or requirements?',
      type: 'text',
      placeholder: 'e.g., specific technologies, accessibility needs, branding guidelines',
      priority: 'low',
      impact: 'Technical implementation decisions'
    });

    return {
      projectType,
      knownFacts,
      assumptions,
      unknowns,
      clarifyingQuestions,
      complexity,
      suggestedAgents,
      analysisConfidence: 0.8
    };
  }

  /**
   * Record response to clarifying question
   */
  async recordResponse(briefId, questionId, response) {
    const brief = this.activeBriefs.get(briefId);
    if (!brief) {
      throw new Error(`Brief ${briefId} not found`);
    }

    brief.responses.set(questionId, {
      questionId,
      response,
      timestamp: new Date()
    });

    console.log(`[BRIEF:${briefId}] Recorded response for ${questionId}: ${JSON.stringify(response)}`);

    // Check if we have enough information to proceed
    const criticalQuestions = brief.clarifyingQuestions.filter(q => q.priority === 'high');
    const answeredCritical = criticalQuestions.filter(q => brief.responses.has(q.id));

    if (answeredCritical.length >= criticalQuestions.length) {
      brief.status = 'ready_for_approval';
      console.log(`[BRIEF:${briefId}] Brief ready for approval - all critical questions answered`);
    }

    return brief;
  }

  /**
   * Generate complete brief from directive and responses
   */
  async generateCompleteBrief(briefId) {
    const brief = this.activeBriefs.get(briefId);
    if (!brief) {
      throw new Error(`Brief ${briefId} not found`);
    }

    // Compile responses into structured brief
    const responses = Array.from(brief.responses.values());
    
    const completedBrief = {
      id: briefId,
      directive: brief.originalDirective,
      projectType: brief.analysis.projectType,
      
      // Project definition
      scope: this.extractResponse(responses, 'scope') || 'Basic prototype/MVP',
      timeline: this.extractResponse(responses, 'timeline') || 'Standard (Half day)',
      targetUsers: this.extractResponse(responses, 'target_users') || 'General public',
      keyFeatures: this.extractResponse(responses, 'key_features') || [],
      successCriteria: this.extractResponse(responses, 'success_criteria') || 'Functional implementation that meets requirements',
      constraints: this.extractResponse(responses, 'constraints') || 'None specified',
      
      // Technical details
      suggestedAgents: brief.analysis.suggestedAgents,
      estimatedComplexity: brief.analysis.complexity,
      
      // Context
      knownFacts: brief.knownFacts,
      assumptions: brief.assumptions,
      
      // Metadata
      createdAt: brief.timestamp,
      approvedAt: new Date(),
      status: 'approved'
    };

    brief.completedBrief = completedBrief;
    brief.status = 'approved';
    
    // Move to completed briefs
    this.completedBriefs.set(briefId, brief);
    
    console.log(`[BRIEF:${briefId}] Brief approved and completed`);
    console.log(`[BRIEF:${briefId}] Project: ${completedBrief.projectType} - ${completedBrief.scope} - ${completedBrief.timeline}`);

    return completedBrief;
  }

  /**
   * Helper to extract response by question ID
   */
  extractResponse(responses, questionId) {
    const response = responses.find(r => r.questionId === questionId);
    return response ? response.response : null;
  }

  /**
   * Get brief status and current state
   */
  getBrief(briefId) {
    return this.activeBriefs.get(briefId) || this.completedBriefs.get(briefId);
  }

  /**
   * Get all briefs for a user
   */
  getBriefsForUser(userId = 'user') {
    const active = Array.from(this.activeBriefs.values()).filter(b => b.userId === userId);
    const completed = Array.from(this.completedBriefs.values()).filter(b => b.userId === userId);
    
    return {
      active,
      completed,
      total: active.length + completed.length
    };
  }

  /**
   * Update brief with additional context or modifications
   */
  async updateBrief(briefId, updates) {
    const brief = this.activeBriefs.get(briefId);
    if (!brief) {
      throw new Error(`Brief ${briefId} not found`);
    }

    Object.assign(brief, updates);
    console.log(`[BRIEF:${briefId}] Brief updated`);
    
    return brief;
  }
}

module.exports = BriefManager;
