# ShellCompany - Autonomous Agent Desktop Application

A production-ready autonomous agent company platform with real-time workflow execution, multi-provider AI integration, and comprehensive monitoring capabilities.

## 🚀 Features

- **Board Room**: Issue directives and track workflow execution
- **Console**: Real-time streaming logs and stdout/stderr monitoring
- **Workers**: Interactive agent environments with file management
- **Ongoing Projects**: Project persistence and artifact management
- **Engine Status**: Live AI provider monitoring with cost-mode intelligence

## 🏗️ Architecture

- **Frontend**: React.js with real-time WebSocket updates
- **Backend**: Node.js/Express with SQLite database
- **AI Integration**: Multi-provider support (OpenAI, Claude, Gemini, xAI)
- **Agent System**: Autonomous workflow execution with task orchestration
- **Monitoring**: Provider health tracking, cost management, and structured logging

## 📋 Prerequisites

- Node.js 16+ and npm
- Git
- API keys for AI providers (optional for demo mode)

## 🛠️ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/[your-username]/ShellCompany.git
cd ShellCompany
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Environment Setup

```bash
# Copy the example environment file
cd ../server
cp .env.example .env
```

Edit `server/.env` with your configuration:

```env
# Basic Configuration
NODE_ENV=development
PORT=3001
DESKTOP_MODE=true

# Database (SQLite - no setup required)
DATABASE_URL=sqlite://./shellcompany.db

# Session & Security
SESSION_SECRET=your-secure-session-secret-here
ENCRYPTION_KEY=your-32-character-encryption-key
JWT_SECRET=your-jwt-secret-here

# AI Provider API Keys (add as needed)
OPENAI_API_KEY=sk-your-openai-key-here
CLAUDE_API_KEY=sk-ant-your-claude-key-here
GEMINI_API_KEY=your-gemini-key-here
X_AI_API_KEY=xai-your-xai-key-here

# OAuth (optional for full features)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### 4. Start the Application

```bash
# From the root directory, start both server and client
npm run dev
```

Or start them separately:

```bash
# Terminal 1 - Start server
cd server
npm start

# Terminal 2 - Start client
cd client
npm start
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

## 🎯 Usage Examples

### Basic Workflow Execution

1. **Navigate to Board Room**
2. **Issue a Directive**: "Create a landing page for a coffee shop"
3. **Monitor Progress**: 
   - View real-time logs in Console tab
   - Track agent activity in Workers tab
   - Check project artifacts in Ongoing Projects

### Engine Status Monitoring

1. **Navigate to Engine Status**
2. **View Provider Health**: See all 5 AI providers (OpenAI, Claude, Gemini, xAI, OpenAI Project)
3. **Adjust Cost Modes**: Set economy/balanced/premium for each provider
4. **Monitor Usage**: Track tokens, requests, and latency

### Agent Environment Interaction

1. **Navigate to Workers tab**
2. **Click on an Agent**: (Alex, Nova, Pixel, etc.)
3. **View Files**: Browse agent workspace and artifacts
4. **Edit Files**: Modify code directly in the dashboard
5. **Chat with Agent**: Ask about implementation decisions

## 🔧 Configuration

### AI Provider Setup

The application supports multiple AI providers with automatic fallback:

```env
# Primary providers
OPENAI_API_KEY=sk-...           # OpenAI GPT models
CLAUDE_API_KEY=sk-ant-...       # Anthropic Claude
GEMINI_API_KEY=...              # Google Gemini
X_AI_API_KEY=xai-...            # xAI Grok

# Project-specific OpenAI key
OPENAI_PROJECT_API_KEY=sk-proj-...
```

### Cost Mode Configuration

Set cost preferences for each provider:
- **Economy**: Fastest, cheapest models
- **Balanced**: Performance/cost balance
- **Premium**: Highest quality models

### OAuth Integration (Optional)

For full GitHub/Google integration:

1. **Create OAuth Apps**:
   - GitHub: https://github.com/settings/developers
   - Google: https://console.cloud.google.com/

2. **Configure Callback URLs**:
   - GitHub: `http://localhost:3001/auth/github/callback`
   - Google: `http://localhost:3001/auth/google/callback`

## 🏃‍♂️ Demo Mode

Run without API keys for demonstration:

```bash
# Set demo environment variables
NODE_ENV=development
DEMO_MODE=true

# Start application
npm run dev
```

In demo mode:
- ✅ UI fully functional
- ✅ Workflow creation and tracking
- ✅ Agent environments and file management
- ✅ Console logging and monitoring
- ⚠️  AI provider calls use mock responses

## 📊 API Endpoints

### Workflow Management
```bash
# Create workflow
POST /api/autonomous/workflow
{
  "directive": "Create a todo app",
  "priority": "normal"
}

# Get workflows
GET /api/autonomous/workflows

# Get workflow details
GET /api/autonomous/workflow/:id
```

### Engine Status
```bash
# Get provider status
GET /api/engine/status

# Get cost policies
GET /api/engine/policies

# Set cost mode
POST /api/engine/provider/:provider/cost-mode
{
  "mode": "premium"
}

# Test provider
POST /api/engine/test/:provider
{
  "prompt": "Hello world"
}
```

### Agent Environments
```bash
# Get agent environment
GET /api/autonomous/agents/:name/environment

# Get agent files
GET /api/autonomous/agents/:name/files/:path
```

## 🗂️ Project Structure

```
ShellCompany/
├── client/                 # React frontend
│   ├── src/components/    # UI components
│   └── public/           # Static assets
├── server/                # Node.js backend
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── agent-workspaces/ # Agent environments
├── package.json          # Root dependencies
└── README.md            # This file
```

## 🔐 Security Considerations

- ✅ API keys stored in environment variables
- ✅ Sensitive files excluded via .gitignore
- ✅ Session-based authentication
- ✅ Input validation and sanitization
- ✅ CORS configuration for development

## 🚢 Deployment

### Local Development
```bash
npm run dev
```

### Production Build
```bash
# Build client
cd client
npm run build

# Start production server
cd ../server
NODE_ENV=production npm start
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=your-production-database-url
SESSION_SECRET=strong-production-secret
# ... other production configs
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Test specific component
npm test -- --grep "BoardRoom"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill

# Or use different port
PORT=3002 npm start
```

**Database Issues**
```bash
# Reset database
rm server/shellcompany.db
npm run dev
```

**Module Not Found**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

- 📋 **Issues**: [GitHub Issues](https://github.com/[your-username]/ShellCompany/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/[your-username]/ShellCompany/discussions)
- 📧 **Email**: support@shellcompany.ai

## 🏆 Acknowledgments

- Built with React, Node.js, and SQLite
- AI integration with OpenAI, Anthropic, Google, and xAI
- Real-time updates via Socket.IO
- UI components and styling

---

**ShellCompany** - *The future of autonomous agent collaboration* 🚀
