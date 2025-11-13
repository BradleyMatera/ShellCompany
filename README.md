
[![ShellCompany Logo](docs-site/static/img/logo.png)](https://github.com/Shell-Company/ShellCompany)

# ShellCompany

> **Status:** Prototype / Early Development — Not production-ready

ShellCompany is an experimental desktop app for managing and monitoring teams of autonomous AI agents. The goal is to provide a dashboard for issuing tasks ("directives") to agents ("Workers") and tracking their progress in real time. **Currently, most features are incomplete or placeholders.**

---

## Project Overview

- **Intended Purpose:**
	- Run a local multi-agent network on your desktop/laptop
	- Issue tasks to agents, monitor execution, view logs
	- Integrate with multiple AI providers (OpenAI, Claude, Gemini, etc.)
- **Current Reality:**
	- UI and backend exist, but most features are not functional
	- No real agent orchestration, live logging, or project management
	- Documentation describes planned features, not actual capabilities

---

## Feature Status Table

| Feature            | Status         | Description |
|--------------------|---------------|-------------|
| React UI           | Implemented   | Basic frontend, mostly static placeholders |
| Node.js Backend    | Partial       | Some API endpoints, migration scripts |
| Agent Workspaces   | Partial       | Directory structure, no real agent logic |
| Board Room         | Not Started   | No true task manager or directive system |
| Console (Logs)     | Not Started   | No real-time logging or output streaming |
| Workers/Agents     | Not Started   | No interactive environments |
| Engine Status      | Not Started   | No AI provider integration/status dashboard |
| Ongoing Projects   | Not Started   | No persistent project/task tracking |
| API Endpoints      | Partial       | Some endpoints, many missing |
| Demo Mode          | Not Started   | No real demo functionality |
| Monitoring/Cost    | Not Started   | Not implemented |
| Docs Site          | Implemented   | Docusaurus site, needs integration |

---

## Quick Start (Prototype Only)

```bash
git clone https://github.com/Shell-Company/ShellCompany.git
cd ShellCompany
npm install
# For client UI
cd client && npm install && npm start
# For server (API)
cd ../server && npm install && node index.js
```

> **Note:** Most features will not work as described in the docs. This is a framework for future development.

---

## Roadmap

### Phase 1: Core Functionality
- Define MVP: Task creation, agent runner, basic logging
- Implement agent logic (Node.js child processes or Python scripts)
- Connect UI to backend for real data

### Phase 2: Multi-Agent Network
- Launch multiple agent processes
- Task assignment and progress tracking
- Status dashboard

### Phase 3: Advanced Features
- AI provider integration
- Project tracking and persistence
- Monitoring and cost modes
- Demo mode

---

## Contributing

We welcome contributions to help make ShellCompany real! See the [docs-site](docs-site/) for more details, or open an issue/PR.

## Developer Quick Start (recommended)

This project uses a root `dev` orchestrator to start the API server and the CRA client with one command.

1. Copy `.env.example` to `.env` and fill any provider keys you want to test.

2. From the repository root, run:

```bash
npm install
npm run dev
```

This will:
- Start the server (on `PORT` or `3001` by default)
- Start the CRA client (on `3000` by default)

If you prefer to run services individually:

```bash
# Server
cd server && npm run de

# Client
cd client && npm start
```

Note: The experimental `local-ui/` Next.js scaffold has been archived to `archive/local-ui` — the canonical front-end is the CRA app in `client/`.

Client -> Server configuration:
- The CRA client can be pointed at any backend by setting `REACT_APP_API_BASE` in `.env` (e.g. `REACT_APP_API_BASE=http://localhost:3001`). If unset, the client will use relative paths and the CRA dev proxy.

Troubleshooting:
- If the client reports proxy errors, ensure the server is running on the expected port.
- Use `lsof -i :3001` to see what process is listening on the server port.


---

## License

MIT