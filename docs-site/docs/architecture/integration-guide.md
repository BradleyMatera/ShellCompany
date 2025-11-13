# Integration Guide: MVP & Advanced Services

This guide explains how the MVP backend, frontend, and advanced services are integrated in ShellCompany, and how to extend or validate the system.

## Backend Integration

- **MVP Models**: Defined in `server/models/mvp-models.js` for Agent, Directive, Project, Log.
- **MVP API Routes**: Implemented in `server/routes/mvp-api.js`, now trigger advanced agent-executor and console-logger.
- **Agent Runner**: Logic in `server/services/agentRunner.js`, orchestrates agent execution and logging.
- **Advanced Services**: `agent-executor.js`, `console-logger.js`, `workflow-orchestrator.js` are hooked into MVP endpoints.

## Frontend Integration

- **MVP Components**: `MVPBoardRoom.js`, `MVPAgents.js`, `MVPConsole.js`, `MVPProjects.js` in `client/src/components/`.
- **Dashboard Navigation**: `App.js` now allows switching between MVP and advanced dashboards; `AppMVP.js` renders MVP dashboard.

## Docs-site Updates

- **Roadmap**: See `architecture/mvp-roadmap.md` for actionable steps.
- **Feature Status**: See `architecture/feature-status.md` for honest mapping.
- **Integration Guide**: This file.

## Testing & Validation

- Run end-to-end tests for MVP endpoints and UI.
- Validate advanced service hooks and dashboard navigation.

---
*This file is auto-generated as part of the MVP implementation and integration process.*
