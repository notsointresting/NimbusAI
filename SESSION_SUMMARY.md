# Nimbus AI Agent - Session Summary

## What We Built Today

### Project Overview
Nimbus AI Agent - An autonomous AI desktop app with:
- Multiple AI providers (Claude, Gemini, Ollama)
- Browser automation via Chrome extension
- File system operations with sandboxing
- Custom skills/workflows

### Major Refactor Completed

**1. TypeScript + React + Vite Migration**
- Converted from vanilla JS to TypeScript
- Added React 18 with modern hooks
- Vite for fast builds
- Path aliases: `@renderer/*`, `@shared/*`, `@server/*`, `@skills/*`

**2. Ollama Provider** (`src/server/providers/ollama.ts`)
- Local LLM support for offline use
- Streaming responses
- Model management (list, pull)
- Recommended models: Llama 3.2, CodeLlama, Mistral, DeepSeek

**3. Gemini Computer Use** (`src/server/providers/gemini-computer-use.ts`)
- Playwright browser automation
- Actions: click, type, scroll, navigate, screenshot
- Uses antigravity proxy or GOOGLE_API_KEY

**4. Skills System** (`src/skills/manager.ts`)
- Triggers: manual, keyword, schedule, event
- Steps: tool, prompt, condition, loop
- Built-in: Organize Downloads, Daily Backup, Quick Search, Code Review
- Context interpolation: `{{variable}}`

**5. Enhanced Sandbox** (`src/server/sandbox.ts`)
- Sensitive paths: Downloads, Documents, .ssh, etc.
- Permission dialogs for sensitive operations
- Audit logging
- Session-based approval caching

**6. React UI Components**
- Sidebar, HomeView, ChatView, SettingsView, SkillsView
- PermissionDialog, Toast notifications
- Provider/model selection

---

## Project Structure

```
C:\Users\Institue\open-claude-cowork-1\
├── src/
│   ├── renderer/      # React UI (Vite)
│   ├── server/        # Express API + providers
│   ├── main/          # Electron main process
│   ├── shared/        # Shared TypeScript types
│   └── skills/        # Skills manager
├── server/            # Legacy JS server (still works)
├── antigravity-claude-proxy/  # Free Claude/Gemini proxy
├── extension/         # Chrome extension
├── tsconfig.*.json    # TypeScript configs
├── vite.config.ts     # Vite config
└── TOMORROW_PLAN.md   # Fixes needed
```

---

## How to Run

**Terminal 1 - Antigravity Proxy:**
```bash
cd antigravity-claude-proxy
npm start
# Runs on http://localhost:8080
```

**Terminal 2 - Nimbus App:**
```bash
cd C:\Users\Institue\open-claude-cowork-1
npm install --legacy-peer-deps
npm run dev
# Server: http://localhost:3001
# UI: http://localhost:5173
```

---

## Issues to Fix (See TOMORROW_PLAN.md)

1. **NPM zod conflict** - Use `--legacy-peer-deps`
2. **Server path wrong** - Fix in `src/main/index.ts`
3. **No stop button** - Add cancel functionality
4. **Gemini fallback** - Try proxy first, then API key
5. **Browser disconnecting** - Add WebSocket ping/pong
6. **Thinking mode error** - Fix in antigravity proxy

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/index.ts` | Main API server |
| `src/server/providers/ollama.ts` | Ollama local LLM |
| `src/server/providers/gemini-computer-use.ts` | Browser automation |
| `src/server/sandbox.ts` | Permission system |
| `src/skills/manager.ts` | Skills/workflows |
| `src/renderer/App.tsx` | React app entry |
| `src/shared/types/index.ts` | All TypeScript types |

---

## API Endpoints

```
POST /api/chat          - Chat with AI (streaming)
GET  /api/providers     - List available providers
GET  /api/skills        - List skills
POST /api/skills/:id/run - Run a skill
GET  /api/health        - Health check
GET  /api/pending-permissions - Get permission requests
POST /api/confirm-permission  - Approve permission
POST /api/deny-permission     - Deny permission
```

---

## Environment Variables

```env
GOOGLE_API_KEY=xxx     # For Gemini Computer Use
PORT=3001              # Server port (default: 3001)
```

---

## GitHub

Repository: https://github.com/notsointresting/NimbusAI.git
Branch: master
Latest commit: feat: major refactor - TypeScript, React, Ollama, Skills, Sandbox

---

## Performance Note

The current app organizes files VERY FAST (see open-claude-cowork.gif).
The desktop icons get reorganized almost instantly.

**Must maintain this speed in new version:**
- Keep tool execution lean, no unnecessary overhead
- Batch file operations where possible
- Cache approved permissions to avoid repeated dialogs
- Don't slow down system-level operations

---

## Tomorrow's First Steps

1. `npm install --legacy-peer-deps`
2. Fix server path in `src/main/index.ts`
3. `npm run build`
4. Start antigravity proxy
5. `npm run dev`
6. Test the app
