<p align="center">
  <h1 align="center">☁️ Nimbus</h1>
</p>

<p align="center">
  <strong>Autonomous AI Agent Desktop Application</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Nimbus-v1.0-blue" alt="Nimbus">
  <img src="https://img.shields.io/badge/Claude-Sonnet%20%26%20Opus-orange" alt="Claude">
  <img src="https://img.shields.io/badge/Gemini-Flash%20%26%20Pro-green" alt="Gemini">
  <img src="https://img.shields.io/badge/Tools-32-purple" alt="Tools">
</p>

<p align="center">
  An open-source autonomous AI agent with full system access. Supports Claude and Gemini models. Complete file management, code execution, web search, browser automation, and more.
</p>

---

## What Can It Do?

Nimbus is a **fully autonomous AI agent** that can:

### File Management
- **Read** any file on your system with line numbers and syntax awareness
- **Write** new files with automatic directory creation
- **Edit** existing files with precise text replacement
- **Search** files using glob patterns (`**/*.js`, `src/**/*.ts`)
- **Grep** through code with regex patterns
- **Copy, Move, Delete** files and directories

### Code Execution
- **Run any shell command** - git, npm, python, docker, and more
- Execute scripts, build projects, run tests
- Full access to system tools and utilities
- Streaming output for long-running commands

### Web & Research
- **WebSearch** - Search the internet using DuckDuckGo (no API key needed)
- **WebFetch** - Fetch and read web pages, extract text content
- Research topics, find documentation, gather information

### Task Management
- **TodoWrite** - Create and track multi-step task progress
- **TodoRead** - View current task list status
- Break down complex tasks into manageable steps
- Track completion status (pending, in_progress, completed)

### Code Analysis
- Analyze file structure, functions, classes
- Extract imports and dependencies
- Understand codebase architecture

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Fully Autonomous** | Agent completes tasks independently without constant prompting |
| **32 Built-in Tools** | File ops, bash, web search, computer use, browser extension, task tracking |
| **Chrome Extension** | Real browser automation with DOM access, form filling, and screenshots |
| **Deletion Protection** | File deletions require explicit user approval |
| **Computer Use** | Browser automation with screenshots, mouse, keyboard control |
| **Streaming Responses** | Real-time output for fast feedback |
| **Multi-Model Support** | Claude Sonnet/Opus and Gemini 3 Flash/Pro |
| **Multi-Turn Agentic Loop** | Up to 50 turns per task for complex operations |
| **Progress Visibility** | See what the agent is doing at each step |
| **Tool Visualization** | View tool inputs and outputs in real-time |
| **Session Persistence** | Conversations maintain context across messages |
| **Free Models Available** | Use Gemini models through Google Cloud Code |

---

## Available Tools (32 Total)

### File Operations
| Tool | Description |
|------|-------------|
| `Read` | Read file contents with line numbers |
| `Write` | Create or overwrite files |
| `Edit` | Replace specific text in files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents with regex |
| `ListDir` | List directory contents |
| `MakeDir` | Create directories |
| `Move` | Move or rename files |
| `Copy` | Copy files or directories |
| `Delete` | Request file deletion (requires approval) |
| `ConfirmDelete` | Execute approved deletion |
| `CancelDelete` | Cancel pending deletion |

### System
| Tool | Description |
|------|-------------|
| `Bash` | Execute shell commands (git, npm, python, etc.) |

### Web
| Tool | Description |
|------|-------------|
| `WebSearch` | Search the internet (DuckDuckGo) |
| `WebFetch` | Fetch and read web page contents |

### Task Management & Progress
| Tool | Description |
|------|-------------|
| `TodoWrite` | Create and update task list |
| `TodoRead` | Read current tasks |
| `Progress` | Report current step to user |

### Analysis
| Tool | Description |
|------|-------------|
| `CodeAnalysis` | Analyze code structure and dependencies |

### Computer Use (Browser Automation)
| Tool | Description |
|------|-------------|
| `Screenshot` | Take a screenshot of the current screen |
| `MouseClick` | Click at screen coordinates (0-1000 scaled) |
| `TypeText` | Type text at cursor position |
| `KeyPress` | Press key combinations (Ctrl+C, Enter, etc.) |
| `OpenBrowser` | Open browser and navigate to URL |
| `Scroll` | Scroll screen up/down/left/right |
| `Wait` | Wait for specified duration |

### Browser Extension Tools (Chrome Extension Required)
| Tool | Description |
|------|-------------|
| `BrowserNavigate` | Navigate browser to a URL |
| `BrowserClick` | Click element by selector or text |
| `BrowserType` | Type into input fields |
| `BrowserRead` | Read page content (text/html/markdown) |
| `BrowserScreenshot` | Screenshot the current tab |
| `BrowserScroll` | Scroll the page |
| `BrowserGetTabs` | List all open tabs |
| `BrowserSwitchTab` | Switch to a specific tab |
| `BrowserFillForm` | Fill multiple form fields at once |
| `BrowserGetElements` | Get info about elements matching selector |

---

## Supported Models

### Claude Models (via Nimbus Proxy)
- `claude-sonnet-4-5-thinking` - Claude Sonnet 4.5 with extended thinking (default)
- `claude-opus-4-5-thinking` - Claude Opus 4.5 with extended thinking

### Gemini Models (via Nimbus Proxy)
- `gemini-3-flash` - Gemini 3 Flash with thinking
- `gemini-3-pro-low` - Gemini 3 Pro (lower quota)
- `gemini-3-pro-high` - Gemini 3 Pro (higher quota)

**Note:** All models have full agentic capabilities - the same 15 tools work with both Claude and Gemini.

---

## Quick Start

### Prerequisites

- Node.js 18+
- [antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy) running

### 1. Clone and Install

```bash
git clone https://github.com/ComposioHQ/open-claude-cowork.git
cd open-claude-cowork

# Install Electron app dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Antigravity Provider (Default)
ANTIGRAVITY_PROXY_URL=http://localhost:8080
ANTIGRAVITY_MODEL=claude-sonnet-4-5-thinking

# For the proxy passthrough
ANTHROPIC_API_KEY=antigravity-proxy
ANTHROPIC_BASE_URL=http://localhost:8080

# Optional: Composio for 500+ external tools
COMPOSIO_API_KEY=your-composio-api-key
```

### 3. Start the Application

**Terminal 1 - Antigravity Proxy:**
```bash
cd antigravity-claude-proxy
npm install
npm start
# First time: Open http://localhost:8080 and add your Google account
```

**Terminal 2 - Backend Server:**
```bash
cd server
npm start
```

**Terminal 3 - Electron App:**
```bash
npm start
```

### 4. Install Chrome Extension (Optional - for browser automation)

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project
5. The extension icon will appear in your toolbar
6. Click it to see connection status

The extension automatically connects to the backend via WebSocket at `ws://localhost:3001/browser`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                              │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │   Main Process  │    │ Renderer Process │                    │
│  │   (main.js)     │    │  (renderer.js)   │                    │
│  └────────┬────────┘    └────────┬─────────┘                    │
│           │                      │                               │
│           └──────────┬───────────┘                               │
└──────────────────────┼───────────────────────────────────────────┘
                       │ HTTP + SSE Streaming
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend Server                               │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Express.js     │───▶│ Antigravity     │                     │
│  │  (server.js)    │    │ Provider        │                     │
│  └─────────────────┘    └────────┬────────┘                     │
│                                  │                               │
│                                  ▼                               │
│                    ┌─────────────────────────┐                   │
│                    │   Local Tool Executor   │                   │
│                    │   (15 tools)            │                   │
│                    └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              Antigravity Claude Proxy (:8080)                    │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Multi-Account  │───▶│ Google Cloud    │                     │
│  │  Load Balancer  │    │ Code API        │                     │
│  └─────────────────┘    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **User sends a message** → Frontend captures and sends to backend
2. **Backend starts agentic loop** → Sends message + tools to proxy
3. **Proxy routes to Google Cloud Code** → Claude or Gemini processes
4. **Model returns tool calls** → Backend executes tools locally
5. **Tool results sent back** → Loop continues until task complete
6. **Streaming output** → User sees progress in real-time

---

## Settings Panel

Access the settings by clicking the gear icon in the left sidebar. The settings panel embeds the Antigravity proxy's web UI with tabs for:

- **Dashboard** - Overview and quick stats
- **Accounts** - Manage Google accounts for API access
- **Models** - View available models
- **Settings** - Configure proxy settings
- **Logs** - View request logs

---

## Use Cases

### Software Development
```
"Create a new React component for user authentication with form validation"
"Find all TODO comments in the codebase and create a task list"
"Refactor this function to use async/await instead of callbacks"
"Run the tests and fix any failures"
```

### File Management
```
"Organize all files in Downloads by file type"
"Find all large files over 100MB and list them"
"Create a backup of the src folder"
"Rename all .txt files to use kebab-case"
```

### Research & Documentation
```
"Search for the latest React 19 features and summarize them"
"Fetch the documentation for Express.js error handling"
"Research best practices for API security"
```

### Data Analysis
```
"Analyze the package.json and list all dependencies"
"Count lines of code by file type in this project"
"Find all functions that don't have error handling"
```

---

## File Structure

```
open-claude-cowork/
├── main.js                 # Electron main process
├── preload.js              # IPC security bridge
├── renderer/
│   ├── index.html          # Chat interface with settings panel
│   ├── renderer.js         # Frontend logic & streaming
│   └── style.css           # Styling
├── server/
│   ├── server.js           # Express + Provider routing
│   ├── tools/
│   │   └── index.js        # 15 tool implementations
│   ├── providers/
│   │   ├── base-provider.js         # Abstract base
│   │   ├── antigravity-provider.js  # Main provider with agentic loop
│   │   ├── claude-provider.js       # Direct Claude SDK
│   │   └── opencode-provider.js     # Opencode SDK
│   └── package.json
├── antigravity-claude-proxy/        # Proxy for Google Cloud Code
├── package.json
├── .env                    # Configuration (not tracked)
└── .env.example            # Template
```

---

## Troubleshooting

### "Failed to connect to Antigravity proxy"
- Ensure antigravity-claude-proxy is running on port 8080
- Visit http://localhost:8080 to verify
- First time: Add a Google account via the web UI

### "Quota exhausted" / "429 Error"
- Add more Google accounts to the proxy
- Switch to Gemini models (often have higher quotas)
- Wait for rate limits to reset

### "Tool execution failed"
- Check file paths are absolute
- Verify permissions for file operations
- Check server logs for detailed errors

### "Slow responses"
- Gemini models are generally faster than Claude
- Streaming is enabled by default for real-time output
- Complex tasks with many tools take longer

---

## Advanced Configuration

### Custom Proxy URL
```env
ANTIGRAVITY_PROXY_URL=http://your-proxy-host:8080
```

### Default Model
```env
ANTIGRAVITY_MODEL=gemini-3-flash
```

### Max Tokens
Configure in `server/providers/antigravity-provider.js`:
```javascript
this.maxTokens = 16384;  // Increase for longer responses
this.maxTurns = 50;      // Increase for more complex tasks
```

### Thinking Budget
For thinking models, adjust the thinking budget:
```javascript
body.thinking = { type: 'enabled', budget_tokens: 10000 };
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Credits & Acknowledgments

Nimbus is built upon and inspired by these amazing projects:

- **[antigravity-claude-proxy](https://github.com/badrisnarayanan/antigravity-claude-proxy)** - Proxy for accessing Claude and Gemini models
- **[Open Claude Cowork](https://github.com/ComposioHQ/open-claude-cowork)** - Original autonomous agent desktop application by Composio

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Legal Disclaimer

**Not affiliated with Google or Anthropic.** This is an independent open-source project and is not endorsed by, sponsored by, or affiliated with Google LLC or Anthropic PBC.

- "Gemini", "Google Cloud", and "Google" are trademarks of Google LLC.
- "Claude" and "Anthropic" are trademarks of Anthropic PBC.

Software is provided "as is", without warranty. You are responsible for complying with all applicable Terms of Service and Acceptable Use Policies.

---

<p align="center">
  <strong>Nimbus - Autonomous AI Agent</strong><br>
  Multi-model support with Claude & Gemini
</p>
