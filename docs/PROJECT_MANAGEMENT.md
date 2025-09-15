# 📂 Project Management System

## Overview

The ShellCompany platform now includes a comprehensive **Real Project Management System** that transforms static workflow displays into fully interactive project workspaces. This system provides complete CRUD operations for project files, real-time editing capabilities, and seamless integration with agent environments.

## 🎯 Key Features

### **Project Workspace Management**
- **Real-time Project Discovery**: Automatically scans all agent workspaces for active projects
- **Interactive File Browser**: Navigate project directories with full file tree display
- **Live File Editing**: Edit project files directly in the browser with save/cancel functionality
- **Artifact Management**: Categorized display of project artifacts with download capabilities
- **Command Execution**: Run npm scripts and safe commands within project environments

### **Project Status Tracking**
- **Active**: Projects currently being worked on
- **Completed**: Finished projects with deliverables
- **In Development**: Projects with ongoing development
- **Setup Required**: Projects needing dependency installation
- **Inactive**: Dormant projects not recently modified

### **Metadata Intelligence**
- **Package.json Integration**: Displays project dependencies, scripts, and metadata
- **README Content**: Shows project descriptions and documentation
- **File Statistics**: Tracks file counts, sizes, and modification dates
- **Agent Attribution**: Shows which agent owns each project

## 🏗️ Technical Architecture

### **Backend Services**

#### **ProjectManager Service** (`/server/services/project-manager.js`)
Core service handling all project operations:

```javascript
// Key Methods
- getProjectWorkspaces()     // Scans all agent workspaces
- analyzeProject()           // Extracts project metadata
- getProjectFiles()          // Recursive file tree generation
- getFileContent()           // Secure file reading
- saveFileContent()          // File editing with validation
- runProjectCommand()        // Safe command execution
- detectProjectMetadata()    // Package.json/README parsing
```

#### **API Endpoints** (`/server/index.js`)
```bash
# Project Discovery
GET /api/projects                    # List all project workspaces

# Project Details
GET /api/projects/:agent/:project    # Get specific project info

# File Management
GET /api/projects/:agent/:project/files/:path     # Read file content
PUT /api/projects/:agent/:project/files/:path     # Save file content

# Command Execution
POST /api/projects/:agent/:project/commands       # Run safe commands

# Project Operations
POST /api/projects/:agent/:project/clone          # Clone project
DELETE /api/projects/:agent/:project              # Delete project
```

### **Frontend Components**

#### **OngoingProjects.js** - Completely Rebuilt
```javascript
// New State Management
const [projects, setProjects] = useState([]);
const [selectedProject, setSelectedProject] = useState(null);
const [selectedFile, setSelectedFile] = useState(null);
const [fileContent, setFileContent] = useState('');
const [isEditing, setIsEditing] = useState(false);

// Key Functions
- fetchProjects()           // Load all projects from API
- loadFileContent()         // Load file for viewing/editing
- saveFileContent()         // Save edited file content
- runProjectCommand()       // Execute project commands
- downloadArtifact()        // Download project files
```

#### **User Interface Flow**
1. **Project Grid View**: Cards showing all projects with status indicators
2. **Project Selection**: Click to enter workspace management mode
3. **Dual-Pane Interface**: File browser (left) + editor/viewer (right)
4. **File Browser**: Hierarchical tree with file type icons
5. **File Editor**: Syntax-highlighted editor with save/cancel controls
6. **Command Panel**: Quick access to npm scripts and common commands

## 🎨 UI/UX Design

### **Project Cards**
- **Status Indicators**: Color-coded borders and icons
- **Type Icons**: Dashboard (📊), API (🔌), Website (🌐), etc.
- **Agent Attribution**: Shows owning agent with avatar
- **Metadata Preview**: File counts, scripts, modification dates
- **Script Tags**: Available npm scripts displayed as badges

### **Workspace Interface**
- **Responsive Layout**: Adapts to different screen sizes
- **File Tree Navigation**: Expandable directory structure
- **Syntax Highlighting**: Code files displayed with proper formatting
- **Action Buttons**: Edit, Save, Cancel, Download, Run commands
- **Breadcrumb Navigation**: Clear project/file path display

### **File Management**
- **File Type Recognition**: Icons for different file types
- **Size Display**: Human-readable file sizes
- **Modification Dates**: Last updated timestamps
- **Directory Support**: Full folder navigation
- **Binary File Handling**: Safe display of non-text files

## 🔒 Security Features

### **Path Validation**
```javascript
// Security check - ensure file is within workspace
const resolvedPath = path.resolve(fullPath);
const resolvedWorkspace = path.resolve(workspacePath);
if (!resolvedPath.startsWith(resolvedWorkspace)) {
    throw new Error('Access denied: File outside workspace');
}
```

### **Command Restrictions**
```javascript
// Only allow safe, predefined commands
const allowedCommands = [
    'npm install', 'npm run build', 'npm run dev',
    'npm run start', 'npm run test', 'npm audit',
    'ls', 'pwd', 'git status', 'git log --oneline -10'
];
```

### **File Access Control**
- All file operations restricted to agent workspace directories
- Path traversal attacks prevented through resolution checks
- Binary file detection to prevent execution of malicious content
- Command timeout limits (30 seconds maximum)

## 📊 Integration Points

### **Agent Environments**
- Projects automatically discovered from agent workspaces
- Seamless transition between Projects and Workers tabs
- Shared file editing capabilities between both interfaces
- Consistent workspace management across all views

### **Workflow System**
- Projects created by autonomous workflows appear automatically
- Real-time updates when agents modify project files
- Artifact lineage tracking from workflow to project deliverables
- Status synchronization between workflow execution and project state

### **Console Logging**
- Project command execution logged to Console tab
- File modification events tracked in system logs
- Error handling with detailed feedback to users
- Debug information for troubleshooting project issues

## 🚀 Usage Examples

### **Basic Project Management**
1. **Navigate to Ongoing Projects tab**
2. **View Project Grid**: See all discovered projects with status
3. **Click Project Card**: Enter workspace management mode
4. **Browse Files**: Navigate project directory structure
5. **Edit Files**: Click file → Edit → Make changes → Save
6. **Run Commands**: Use quick command buttons for npm scripts

### **Advanced Workflows**
```bash
# Project Continuation
1. Select "in-development" project
2. Review existing code and documentation
3. Make necessary modifications
4. Run tests: npm run test
5. Build: npm run build
6. Deploy changes

# Project Cloning
1. Find successful project template
2. Use clone functionality
3. Modify for new requirements
4. Update package.json metadata
5. Customize implementation
```

### **Artifact Management**
```bash
# Download Project Files
1. Navigate to project workspace
2. Select files or artifacts
3. Use download functionality
4. Files saved locally for external use

# Project Documentation
1. View README.md in project browser
2. Check package.json for dependencies
3. Review execution logs for context
4. Access project plan documents
```

## 🔧 Configuration

### **Project Discovery Settings**
```javascript
// Customize project scanning behavior
const projectsRoot = path.join(__dirname, '../agent-workspaces');

// File filtering patterns
const ignorePatterns = [
    'node_modules', '.git', '.next', 'dist', 'build'
];

// Project type detection
const projectTypes = {
    'dashboard': /dashboard/i,
    'api': /api/i,
    'website': /web|site/i,
    'landing-page': /landing/i
};
```

### **Security Configuration**
```javascript
// Command execution limits
const commandTimeout = 30000; // 30 seconds

// File size limits for editing
const maxFileSize = 1024 * 1024; // 1MB

// Allowed file extensions for editing
const editableExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.json',
    '.md', '.txt', '.css', '.scss', '.html'
];
```

## 🐛 Troubleshooting

### **Common Issues**

#### **Projects Not Appearing**
```bash
# Check workspace directory structure
ls -la server/agent-workspaces/

# Ensure projects follow naming convention
# Format: {agent-name}-workspace/{project-name}-project/
```

#### **File Editing Problems**
```bash
# Check file permissions
chmod 644 server/agent-workspaces/**/*

# Verify file paths in API calls
# Ensure proper URL encoding for file paths
```

#### **Command Execution Failures**
```bash
# Check allowed commands list
# Verify npm dependencies installed
# Review timeout settings for long-running commands
```

### **Debug Information**
```javascript
// Enable debug logging
console.log('Projects API response:', data);
console.log('File content loading:', { project, file });
console.log('Command execution result:', result);
```

## 🔮 Future Enhancements

### **Planned Features**
- **Real-time Collaboration**: Multiple users editing same project
- **Version Control Integration**: Git operations within interface
- **Project Templates**: Pre-configured project scaffolding
- **Advanced Search**: Full-text search across all project files
- **Deployment Integration**: One-click deployment to various platforms

### **Performance Optimizations**
- **File Caching**: Reduce API calls for frequently accessed files
- **Lazy Loading**: Load project details on-demand
- **Compression**: Gzip file transfers for large projects
- **Pagination**: Handle large numbers of projects efficiently

---

This project management system transforms ShellCompany from a workflow viewer into a complete **development environment** where users can interact with, modify, and continue autonomous agent projects seamlessly.