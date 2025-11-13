# ShellCompany: Your Desktop Mission Control for AI Agents

ShellCompany is a local-first application that lets you manage teams of autonomous AI agents. Issue a "directive," and watch as an AI project manager clarifies the requirements, assigns tasks to specialist AI agents, and delivers the results for your approval. It's a powerful way to harness the power of multiple AI models to accomplish complex tasks, right from your desktop.

## Key Features

*   **Board Room:** Your central hub for issuing directives and monitoring their progress from start to finish.
*   **Agent Environments:** Peek into the workspace of each AI agent. See their files, chat with them about their work, and watch them in real-time.
*   **Live Console:** A unified, real-time stream of logs from all your agents.
*   **Project Management:** Every directive becomes a project. Browse the files, see the history, and download the final artifacts.
*   **Multi-Provider AI:** Works with OpenAI, Anthropic (Claude), Google (Gemini), and xAI (Grok) models.

## How It Works

1.  **Issue a Directive:** You give a high-level goal, like "Create a landing page for a new coffee shop."
2.  **Manager Agent Takes Over:** An AI "manager" agent (e.g., a project manager) analyzes your request, asks clarifying questions, and creates a detailed plan.
3.  **Specialist Agents Get to Work:** The manager assigns tasks to "specialist" agents (e.g., a frontend developer, a copywriter).
4.  **Monitor and Interact:** You can watch the agents work in real-time, browse their files, and even chat with them to provide feedback.
5.  **Review and Approve:** Once the work is complete, the manager presents it for your final review and approval.

**(placeholder for a GIF showing the app in action)**

## Getting Started

### Prerequisites

*   Node.js (v16 or higher)
*   Git

### 1. Clone the Repository

```bash
git clone https://github.com/Shell-Company/ShellCompany.git
cd ShellCompany
```

### 2. Install Dependencies

```bash
# Install dependencies for all packages
npm install
```

### 3. Set Up Your Environment

In the `server` directory, copy the example environment file:

```bash
cd server
cp .env.example .env
```

Now, open `server/.env` and add your AI provider API keys. You can also configure other settings, but the defaults are a good place to start.

```env
# AI Provider API Keys (add as needed)
OPENAI_API_KEY=sk-your-openai-key-here
CLAUDE_API_KEY=sk-ant-your-claude-key-here
GEMINI_API_KEY=your-gemini-key-here
X_AI_API_KEY=xai-your-xai-key-here
```

### 4. Run the Application

From the root directory of the project, run:

```bash
npm run dev
```

This will start both the frontend and backend servers.

*   **Frontend:** [http://localhost:3000](http://localhost:3000)
*   **Backend API:** [http://localhost:3001](http://localhost:3001)

## Usage

1.  Open the application in your browser at `http://localhost:3000`.
2.  Go to the **Board Room**.
3.  Issue a directive, like "Write a short story about a robot who discovers music."
4.  Watch as the agents work together to complete your request.

## Contributing

We welcome contributions! Please see our [contributing guidelines](./CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
