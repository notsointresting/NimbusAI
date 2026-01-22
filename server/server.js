import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import http from 'http';
import { getProvider, getAvailableProviders, initializeProviders } from './providers/index.js';
import { getPendingDeletions, getProgress, setBrowserExtension, getPendingPermissions, confirmPermission, denyPermission } from './tools/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Composio is optional - only initialize if API key is present
let composio = null;
const composioSessions = new Map();
let defaultComposioSession = null;
let composioEnabled = false;

// Try to initialize Composio if API key is available
async function initializeComposio() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.log('[COMPOSIO] No API key found - Composio tools disabled');
    return;
  }

  try {
    const { Composio } = await import('@composio/core');
    composio = new Composio();
    composioEnabled = true;
    console.log('[COMPOSIO] Initialized successfully');
  } catch (error) {
    console.warn('[COMPOSIO] Failed to initialize:', error.message);
  }
}

// Pre-initialize Composio session on startup (only if enabled)
async function initializeComposioSession() {
  if (!composioEnabled || !composio) {
    return;
  }

  const defaultUserId = 'default-user';
  console.log('[COMPOSIO] Pre-initializing session for:', defaultUserId);
  try {
    defaultComposioSession = await composio.create(defaultUserId);
    composioSessions.set(defaultUserId, defaultComposioSession);
    console.log('[COMPOSIO] Session ready with MCP URL:', defaultComposioSession.mcp.url);

    // Update opencode.json with the MCP config
    updateOpencodeConfig(defaultComposioSession.mcp.url, defaultComposioSession.mcp.headers);
    console.log('[OPENCODE] Updated opencode.json with MCP config');
  } catch (error) {
    console.error('[COMPOSIO] Failed to pre-initialize session:', error.message);
  }
}

// Write MCP config to opencode.json
function updateOpencodeConfig(mcpUrl, mcpHeaders) {
  const opencodeConfigPath = path.join(__dirname, 'opencode.json');
  const config = {
    mcp: {
      composio: {
        type: 'remote',
        url: mcpUrl,
        headers: mcpHeaders
      }
    }
  };
  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2));
}

// Middleware
app.use(cors());
app.use(express.json());

// Chat endpoint using provider abstraction
app.post('/api/chat', async (req, res) => {
  const {
    message,
    chatId,
    userId = 'default-user',
    provider: providerName = 'antigravity',  // Per-request provider selection (default: antigravity)
    model = null  // Per-request model selection
  } = req.body;

  console.log('[CHAT] Request received:', message);
  console.log('[CHAT] Chat ID:', chatId);
  console.log('[CHAT] Provider:', providerName);
  console.log('[CHAT] Model:', model || '(default)');

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Validate provider
  const availableProviders = getAvailableProviders();
  if (!availableProviders.includes(providerName.toLowerCase())) {
    return res.status(400).json({
      error: `Invalid provider: ${providerName}. Available: ${availableProviders.join(', ')}`
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Processing request...' })}\n\n`);

  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  try {
    // Get or create Composio session for this user (only if Composio is enabled)
    let mcpServers = {};

    if (composioEnabled && composio) {
      let composioSession = composioSessions.get(userId);
      if (!composioSession) {
        console.log('[COMPOSIO] Creating new session for user:', userId);
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Initializing session...' })}\n\n`);
        composioSession = await composio.create(userId);
        composioSessions.set(userId, composioSession);
        console.log('[COMPOSIO] Session created with MCP URL:', composioSession.mcp.url);

        // Update opencode.json with the MCP config
        updateOpencodeConfig(composioSession.mcp.url, composioSession.mcp.headers);
        console.log('[OPENCODE] Updated opencode.json with MCP config');
      }

      // Build MCP servers config - passed to provider
      mcpServers = {
        composio: {
          type: 'http',
          url: composioSession.mcp.url,
          headers: composioSession.mcp.headers
        }
      };
    }

    // Get the provider instance
    const provider = getProvider(providerName);

    console.log('[CHAT] Using provider:', provider.name);
    console.log('[CHAT] All stored sessions:', Array.from(provider.sessions.entries()));

    // Stream responses from the provider
    try {
      for await (const chunk of provider.query({
        prompt: message,
        chatId,
        userId,
        mcpServers,
        model,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite'],
        maxTurns: 20
      })) {
        // Send chunk as SSE
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(data);
      }
    } catch (streamError) {
      console.error('[CHAT] Stream error during iteration:', streamError);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: streamError.message })}\n\n`);
      }
    }

    clearInterval(heartbeatInterval);
    if (!res.writableEnded) {
      res.end();
    }
    console.log('[CHAT] Stream completed');
  } catch (error) {
    clearInterval(heartbeatInterval);
    console.error('[CHAT] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Get available providers endpoint
app.get('/api/providers', (_req, res) => {
  res.json({
    providers: getAvailableProviders(),
    default: 'antigravity'
  });
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: getAvailableProviders()
  });
});

// Get pending deletions for a session
app.get('/api/pending-deletions', (req, res) => {
  const { sessionId } = req.query;
  const pending = getPendingDeletions(sessionId);
  res.json({
    pending,
    count: pending.length
  });
});

// Get progress for a session
app.get('/api/progress', (req, res) => {
  const { sessionId } = req.query;
  const progress = getProgress(sessionId);
  res.json({
    progress,
    count: progress.length
  });
});

// Get pending permissions for a session
app.get('/api/pending-permissions', (req, res) => {
  const { sessionId } = req.query;
  const pending = getPendingPermissions(sessionId);
  res.json({
    pending,
    count: pending.length
  });
});

// Confirm a pending permission
app.post('/api/confirm-permission', (req, res) => {
  const { permissionId } = req.body;
  const result = confirmPermission(permissionId);
  res.json(result);
});

// Deny a pending permission
app.post('/api/deny-permission', (req, res) => {
  const { permissionId } = req.body;
  const result = denyPermission(permissionId);
  res.json(result);
});

await initializeComposio();
await initializeProviders();
await initializeComposioSession();

// Create HTTP server from Express app
const httpServer = http.createServer(app);

// ============================================
// WebSocket Server for Chrome Extension
// ============================================

const wss = new WebSocketServer({ server: httpServer, path: '/browser' });
let browserExtensionSocket = null;
let pendingRequests = new Map();
let requestIdCounter = 0;

wss.on('connection', (ws, req) => {
  console.log('[WS] Browser extension connected from:', req.socket.remoteAddress);
  browserExtensionSocket = ws;

  // Notify tools that browser extension is available
  setBrowserExtension({
    isConnected: () => browserExtensionSocket && browserExtensionSocket.readyState === 1,
    sendCommand: async (action, params) => {
      if (!browserExtensionSocket || browserExtensionSocket.readyState !== 1) {
        throw new Error('Browser extension not connected');
      }

      const id = ++requestIdCounter;
      const message = { id, action, params };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Browser command ${action} timed out`));
        }, 30000);

        pendingRequests.set(id, { resolve, reject, timeout });
        browserExtensionSocket.send(JSON.stringify(message));
      });
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[WS] Received:', message.type || message.action);

      if (message.type === 'register') {
        console.log('[WS] Extension registered:', message.client, 'v' + message.version);
        ws.send(JSON.stringify({ type: 'registered', status: 'ok' }));
      } else if (message.type === 'result' || message.type === 'error') {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(message.id);

          if (message.type === 'error') {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message);
          }
        }
      }
    } catch (error) {
      console.error('[WS] Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Browser extension disconnected');
    if (browserExtensionSocket === ws) {
      browserExtensionSocket = null;
      setBrowserExtension(null);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

// API endpoint to check browser extension status
app.get('/api/browser-status', (_req, res) => {
  res.json({
    connected: browserExtensionSocket && browserExtensionSocket.readyState === 1,
    available: !!browserExtensionSocket
  });
});

// Start server and keep reference to prevent garbage collection
const server = httpServer.listen(PORT, () => {
  console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✓ WebSocket for browser: ws://localhost:${PORT}/browser`);
  console.log(`✓ Providers endpoint: GET http://localhost:${PORT}/api/providers`);
  console.log(`✓ Health check: GET http://localhost:${PORT}/api/health`);
  console.log(`✓ Available providers: ${getAvailableProviders().join(', ')}\n`);
});

// Keep the process alive
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Prevent the process from exiting
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
