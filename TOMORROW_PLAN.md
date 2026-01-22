# Nimbus AI Agent - Fix Plan

## CRITICAL: Performance Requirement

**See `open-claude-cowork.gif`** - The app organizes desktop icons INSTANTLY.
This speed MUST be maintained in the new TypeScript version.

### Performance Approach:
1. **Lean tool execution** - No unnecessary middleware between tool calls
2. **Batch operations** - Move/organize multiple files in single operation
3. **Permission caching** - Once approved, don't ask again for same path
4. **Async where possible** - Don't block on non-critical operations
5. **Direct file system calls** - Use Node.js fs directly, minimal abstraction

---

## Issues to Fix

### 1. NPM Install - Zod Peer Dependency Conflict
**Problem:** `@anthropic-ai/claude-agent-sdk` requires zod ^4.0.0, but we have zod ^3.23.0

**Solution:**
```bash
# Option A: Use legacy peer deps
npm install --legacy-peer-deps

# Option B: Update package.json to use zod v4
# Change: "zod": "^3.23.0" to "zod": "^4.0.0"
```

**File:** `package.json` line 62

---

### 2. Server Not Found Error
**Problem:** `Cannot find module 'dist/server/index.js'`

The main.js/main.ts is looking for compiled server but it's not built yet.

**Solution:**
- Update `src/main/index.ts` to use the legacy `server/server.js` in dev mode
- Or run build first: `npm run build:server`
- Fix the path in main process to point to correct location

**File:** `src/main/index.ts` lines 24-27

```typescript
// Change from:
const serverPath = isDev
  ? path.join(__dirname_current, '..', '..', 'server', 'server.js')
  : path.join(__dirname_current, '..', 'server', 'index.js');

// To:
const serverPath = path.join(__dirname_current, '..', '..', 'server', 'server.js');
```

---

### 3. Add Stop/Cancel Functionality
**Problem:** No way to stop running operations

**Solution:**
- Add abort controller to server requests
- Add "Stop" button in UI when loading
- Add `/api/cancel` endpoint

**Files to modify:**
- `src/server/index.ts` - Add cancel endpoint
- `src/renderer/components/ChatView.tsx` - Add stop button
- `src/renderer/hooks/useChat.ts` - Already has `cancelRequest()`

---

### 4. Gemini Computer Use - Try Proxy First, Fallback to API Key
**Problem:** Want to try antigravity proxy first, use GOOGLE_API_KEY as fallback

**Solution:**
Update `src/server/providers/gemini-computer-use.ts`:

```typescript
async query(params) {
  // Try proxy first
  try {
    const response = await fetch(`${this.proxyUrl}/v1/messages`, {...});
    if (response.ok) {
      // Use proxy response
      return;
    }
  } catch (proxyError) {
    console.log('[GeminiComputerUse] Proxy failed, trying direct API...');
  }

  // Fallback to direct Gemini API
  if (process.env.GOOGLE_API_KEY) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/...', {
      headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY }
    });
  }
}
```

**File:** `src/server/providers/gemini-computer-use.ts`

---

### 5. Claude Thinking Mode Error
**Problem:**
```
Expected `thinking` or `redacted_thinking`, but found `text`.
When `thinking` is enabled, assistant message must start with thinking block.
```

**Solution:**
In the antigravity proxy or provider, when using thinking models:
- Ensure assistant messages include thinking blocks
- Or disable thinking mode for regular queries

**Files to check:**
- `antigravity-claude-proxy/` - Check how thinking mode is handled
- `server/providers/` - Check if thinking mode is being set incorrectly

---

### 6. Browser Disconnecting Issue
**Problem:** WebSocket connection to browser extension keeps disconnecting

**Solution:**
- Add reconnection logic to WebSocket handler
- Add heartbeat/ping-pong to keep connection alive
- Better error handling

**File:** `src/server/index.ts` WebSocket section (lines 450-495)

```typescript
// Add ping interval
const pingInterval = setInterval(() => {
  if (browserExtension?.readyState === WebSocket.OPEN) {
    browserExtension.ping();
  }
}, 30000);

// Handle pong
ws.on('pong', () => {
  // Connection is alive
});
```

---

## Quick Fix Commands (Run Tomorrow)

```bash
# 1. Fix npm install
npm install --legacy-peer-deps

# 2. Build everything
npm run build

# 3. Start antigravity proxy (Terminal 1)
cd antigravity-claude-proxy && npm start

# 4. Start nimbus (Terminal 2)
cd .. && npm run dev
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `package.json` | Update zod to ^4.0.0 OR use --legacy-peer-deps |
| `src/main/index.ts` | Fix server path for dev mode |
| `src/server/index.ts` | Add cancel endpoint, fix WebSocket reconnect |
| `src/server/providers/gemini-computer-use.ts` | Add proxy fallback logic |
| `src/renderer/components/ChatView.tsx` | Add stop button UI |

---

## Priority Order

1. **HIGH** - Fix npm install (zod conflict)
2. **HIGH** - Fix server path issue
3. **MEDIUM** - Add stop functionality
4. **MEDIUM** - Gemini proxy fallback
5. **LOW** - Browser reconnection
6. **LOW** - Thinking mode fix (proxy issue)

---

## Notes

- The app structure is solid, just needs these runtime fixes
- Most issues are configuration/path related, not code logic
- Consider adding an `.npmrc` file with `legacy-peer-deps=true`
