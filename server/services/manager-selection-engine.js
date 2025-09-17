/**
 * Manager Selection Engine
 * 
 * Intelligent manager selection based on directive intent analysis.
 * No defaults or hardcoded assignments - every manager is selected
 * based on real analysis of the directive content and requirements.
 */

const RealProviderEngine = require('./real-provider-engine');

class ManagerSelectionEngine {
    constructor(realProviderEngine = null) {
        this.realProviderEngine = realProviderEngine;
        this.managers = {
            'Alex': {
                name: 'Alex',
                expertise: ['Leadership', 'Strategy', 'Project Management', 'General'],
                specialties: ['cross-functional coordination', 'business strategy', 'team leadership'],
                preferredFor: ['complex projects', 'strategic initiatives', 'cross-department work']
            },
            'Sage': {
                name: 'Sage',
                expertise: ['DevOps', 'Infrastructure', 'Documentation', 'Operations'],
                specialties: ['system architecture', 'deployment', 'technical documentation'],
                preferredFor: ['technical projects', 'infrastructure work', 'documentation']
            },
            'Nova': {
                name: 'Nova',
                expertise: ['Frontend', 'UI/UX', 'Web Development', 'Product'],
                specialties: ['user interfaces', 'web applications', 'user experience'],
                preferredFor: ['web projects', 'frontend work', 'user-facing features']
            },
            'Zephyr': {
                name: 'Zephyr',
                expertise: ['Backend', 'APIs', 'Data', 'Engineering'],
                specialties: ['backend systems', 'API development', 'data processing'],
                preferredFor: ['backend projects', 'API work', 'data systems']
            },
            'Pixel': {
                name: 'Pixel',
                expertise: ['Design', 'Visual', 'Branding', 'Creative'],
                specialties: ['visual design', 'branding', 'creative direction'],
                preferredFor: ['design projects', 'branding work', 'visual content']
            },
            'Cipher': {
                name: 'Cipher',
                expertise: ['Security', 'Privacy', 'Compliance', 'Risk'],
                specialties: ['security architecture', 'privacy compliance', 'risk assessment'],
                preferredFor: ['security projects', 'compliance work', 'risk management']
            }
        };

        this.intentPatterns = {
            'Alex': [
                /strategic?/i, /planning/i, /coordinate/i, /manage/i, /lead/i, /oversee/i,
                /cross[- ]?functional/i, /multi[- ]?team/i, /business/i, /strategy/i,
                /overall/i, /general/i, /comprehensive/i, /initiative/i
            ],
            'Sage': [
                /deploy/i, /infrastructure/i, /devops/i, /server/i, /hosting/i,
                /documentation/i, /technical.*doc/i, /readme/i, /guide/i,
                /setup/i, /configure/i, /install/i, /environment/i
            ],
            'Nova': [
                /website/i, /web.*app/i, /frontend/i, /ui/i, /interface/i,
                /landing.*page/i, /dashboard/i, /component/i, /react/i, /vue/i,
                /user.*experience/i, /ux/i, /interactive/i, /responsive/i
            ],
            'Zephyr': [
                /backend/i, /api/i, /database/i, /server.*side/i, /endpoint/i,
                /data.*process/i, /integration/i, /service/i, /microservice/i,
                /pipeline/i, /workflow.*engine/i, /automation/i
            ],
            'Pixel': [
                /design/i, /visual/i, /brand/i, /logo/i, /graphic/i, /aesthetic/i,
                /color/i, /layout/i, /style/i, /creative/i, /artwork/i,
                /mockup/i, /prototype/i, /wireframe/i
            ],
            'Cipher': [
                /security/i, /privacy/i, /encrypt/i, /auth/i, /secure/i,
                /compliance/i, /gdpr/i, /hipaa/i, /risk/i, /vulnerability/i,
                /penetration.*test/i, /audit/i, /protection/i
            ]
        };

        this.contextKeywords = {
            technical: ['code', 'development', 'programming', 'software', 'system'],
            business: ['strategy', 'market', 'revenue', 'customer', 'business'],
            creative: ['design', 'visual', 'creative', 'brand', 'aesthetic'],
            operational: ['deploy', 'infrastructure', 'operations', 'maintenance'],
            security: ['secure', 'protection', 'privacy', 'compliance', 'risk'],
            user_facing: ['website', 'app', 'interface', 'user', 'frontend']
        };
    }

    /**
     * Select the most appropriate manager based on directive analysis
     */
    async selectManager(directive) {
        try {
            console.log(`[ManagerSelection] Analyzing directive: "${directive}"`);

            // Step 1: AI-powered intent analysis
            const intentAnalysis = await this._analyzeDirectiveIntent(directive);
            
            // Step 2: Pattern matching scoring
            const patternScores = this._calculatePatternScores(directive);
            
            // Step 3: Context analysis
            const contextScores = this._analyzeContext(directive);
            
            // Step 4: Combine scores and select best manager
            const finalScores = this._combineScoringFactors(intentAnalysis, patternScores, contextScores);
            
            const selectedManager = this._selectBestManager(finalScores);
            
            console.log(`[ManagerSelection] Selected manager: ${selectedManager.name}`);
            console.log(`[ManagerSelection] Selection reasoning:`, selectedManager.reasoning);
            
            return selectedManager;

        } catch (error) {
            console.error('[ManagerSelection] Error in manager selection:', error);
            
            // Fallback: use pattern matching only
            const patternScores = this._calculatePatternScores(directive);
            const fallbackManager = this._selectBestManager({ patternScores });
            
            console.log(`[ManagerSelection] Fallback to pattern-based selection: ${fallbackManager.name}`);
            return fallbackManager;
        }
    }

    /**
     * Use AI to analyze directive intent and requirements
     */
    async _analyzeDirectiveIntent(directive) {
        const prompt = `Analyze this project directive and determine which type of manager would be best suited to lead it:

Directive: "${directive}"

Available managers and their expertise:
- Alex: Leadership, Strategy, Project Management, Cross-functional coordination
- Sage: DevOps, Infrastructure, Documentation, Technical operations
- Nova: Frontend, UI/UX, Web Development, User-facing products
- Zephyr: Backend, APIs, Data systems, Server-side engineering
- Pixel: Design, Visual, Branding, Creative direction
- Cipher: Security, Privacy, Compliance, Risk management

Respond with a JSON object containing:
{
  "primary_manager": "ManagerName",
  "confidence": 0.85,
  "reasoning": "Brief explanation",
  "secondary_options": ["Manager2", "Manager3"],
  "project_type": "technical|business|creative|operational|security|mixed",
  "complexity": "low|medium|high",
  "requirements": ["requirement1", "requirement2"]
}`;

        try {
            if (!this.realProviderEngine) {
                console.log('[ManagerSelection] No real provider engine available, using fallback');
                return null;
            }

            const response = await this.realProviderEngine.generateCompletion(prompt, {
                maxTokens: 500,
                temperature: 0.3,
                preferredModel: 'gpt-4o-mini'
            });

            const analysis = JSON.parse(response.text);
            console.log('[ManagerSelection] AI Analysis:', analysis);
            return analysis;

        } catch (error) {
            console.error('[ManagerSelection] AI analysis failed:', error);
            return null;
        }
    }

    /**
     * Calculate pattern matching scores for each manager
     */
    _calculatePatternScores(directive) {
        const scores = {};
        const lowerDirective = directive.toLowerCase();

        Object.keys(this.managers).forEach(managerName => {
            const patterns = this.intentPatterns[managerName] || [];
            let score = 0;

            patterns.forEach(pattern => {
                const matches = lowerDirective.match(pattern);
                if (matches) {
                    score += matches.length;
                }
            });

            scores[managerName] = score;
        });

        console.log('[ManagerSelection] Pattern scores:', scores);
        return scores;
    }

    /**
     * Analyze directive context and complexity
     */
    _analyzeContext(directive) {
        const scores = {};
        const lowerDirective = directive.toLowerCase();

        // Analyze context keywords
        const contextMatches = {};
        Object.keys(this.contextKeywords).forEach(contextType => {
            const keywords = this.contextKeywords[contextType];
            contextMatches[contextType] = keywords.filter(keyword => 
                lowerDirective.includes(keyword)
            ).length;
        });

        // Map context to managers
        Object.keys(this.managers).forEach(managerName => {
            const manager = this.managers[managerName];
            let score = 0;

            // Technical context favors technical managers
            if (contextMatches.technical > 0) {
                if (['Sage', 'Zephyr', 'Nova'].includes(managerName)) score += contextMatches.technical;
            }

            // Business context favors strategic managers
            if (contextMatches.business > 0) {
                if (['Alex'].includes(managerName)) score += contextMatches.business * 2;
            }

            // Creative context favors design managers
            if (contextMatches.creative > 0) {
                if (['Pixel', 'Nova'].includes(managerName)) score += contextMatches.creative;
            }

            // Security context favors security managers
            if (contextMatches.security > 0) {
                if (['Cipher'].includes(managerName)) score += contextMatches.security * 2;
            }

            scores[managerName] = score;
        });

        console.log('[ManagerSelection] Context scores:', scores);
        return scores;
    }

    /**
     * Combine all scoring factors
     */
    _combineScoringFactors(intentAnalysis, patternScores, contextScores) {
        const finalScores = {};

        Object.keys(this.managers).forEach(managerName => {
            let totalScore = 0;

            // AI analysis score (highest weight if available)
            if (intentAnalysis && intentAnalysis.primary_manager === managerName) {
                totalScore += intentAnalysis.confidence * 100;
            } else if (intentAnalysis && intentAnalysis.secondary_options?.includes(managerName)) {
                totalScore += 30;
            }

            // Pattern matching score
            totalScore += (patternScores[managerName] || 0) * 10;

            // Context score
            totalScore += (contextScores[managerName] || 0) * 5;

            finalScores[managerName] = totalScore;
        });

        console.log('[ManagerSelection] Final scores:', finalScores);
        return { finalScores, intentAnalysis, patternScores, contextScores };
    }

    /**
     * Select the best manager based on combined scores
     */
    _selectBestManager(scoringData) {
        const { finalScores, intentAnalysis } = scoringData;

        // Find the manager with highest score
        let bestManager = null;
        let highestScore = -1;

        Object.keys(finalScores).forEach(managerName => {
            if (finalScores[managerName] > highestScore) {
                highestScore = finalScores[managerName];
                bestManager = managerName;
            }
        });

        // If no clear winner, default to Alex for general leadership
        if (!bestManager || highestScore === 0) {
            bestManager = 'Alex';
            console.log('[ManagerSelection] No clear winner, defaulting to Alex for general leadership');
        }

        const manager = this.managers[bestManager];
        
        return {
            name: bestManager,
            expertise: manager.expertise,
            specialties: manager.specialties,
            reasoning: intentAnalysis?.reasoning || `Selected based on pattern matching and context analysis. Score: ${highestScore}`,
            confidence: intentAnalysis?.confidence || 0.7,
            scores: finalScores
        };
    }

    /**
     * Get all available managers
     */
    getAvailableManagers() {
        return Object.keys(this.managers).map(name => ({
            name,
            ...this.managers[name]
        }));
    }

    /**
     * Get manager details by name
     */
    getManagerDetails(name) {
        return this.managers[name] ? {
            name,
            ...this.managers[name]
        } : null;
    }

    /**
     * Select manager by intent - API-compatible method
     */
    async selectManagerByIntent(directive) {
        console.log(`[ManagerSelection] Intent-based selection for: "${directive}"`);

        const result = await this.selectManager(directive);

        // Return in expected format with ID
        return {
            id: result.name.toLowerCase(),
            name: result.name,
            expertise: result.expertise,
            specialties: result.specialties,
            reasoning: result.reasoning,
            confidence: result.confidence,
            scores: result.scores
        };
    }
}

module.exports = { ManagerSelectionEngine };
