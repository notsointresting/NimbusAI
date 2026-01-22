/**
 * Nimbus AI Agent - TypeScript Server
 * Main server entry point with provider abstraction, skills, and sandboxing
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Import providers
import { OllamaProvider } from './providers/ollama';
import { GeminiComputerUseProvider } from './providers/gemini-computer-use';
import { Sandbox } from './sandbox';

// Import skills manager
import SkillsManager from '../skills/manager';

// Import types
import type {
  ProviderType,
  StreamEvent,
  Permission,
  ChatRequest,
} from '../shared/types';

const app = express();
const PORT = process.env.PORT || 3001;

// Provider instances
const ollamaProvider = new OllamaProvider();
const geminiComputerUse = new GeminiComputerUseProvider();

// Sandbox instance
const sandbox = new Sandbox();

// Skills manager with a simple tool executor
const skillsManager = new SkillsManager(async (name: string, input: Record<string, unknown>) => {
  console.log(`[Skills] Executing tool: ${name}`, input);
  return { success: true, tool: name };
});

// Session management
interface ChatSession {
  provider: ProviderType;
  model: string;
  history: Array<{ role: string; content: string }>;
}

const sessions = new Map<string, ChatSession>();

// Pending permissions for UI
const pendingPermissions = new Map<string, Permission>();

// Browser extension WebSocket
let browserExtension: WebSocket | null = null;
const pendingBrowserRequests = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}>();
let requestIdCounter = 0;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Dynamic provider loading based on legacy server
 */
async function loadLegacyProviders(): Promise<Map<string, unknown>> {
  const providers = new Map<string, unknown>();

  try {
    // Try to load legacy providers from the server folder
    const legacyPath = path.join(__dirname, '..', '..', 'server', 'providers', 'index.js');
    const { getProvider, getAvailableProviders, initializeProviders } = await import(legacyPath);

    await initializeProviders();

    const available = getAvailableProviders() as string[];
    for (const name of available) {
      providers.set(name, getProvider(name));
    }

    console.log('[Providers] Loaded legacy providers:', available);
  } catch (error) {
    console.warn('[Providers] Could not load legacy providers:', (error as Error).message);
  }

  return providers;
}

let legacyProviders: Map<string, unknown> = new Map();

/**
 * Get provider instance by name
 */
function getProviderInstance(providerName: string): unknown {
  switch (providerName) {
    case 'ollama':
      return ollamaProvider;
    case 'gemini-computer-use':
      return geminiComputerUse;
    default:
      // Try legacy providers
      if (legacyProviders.has(providerName)) {
        return legacyProviders.get(providerName);
      }
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

interface LegacyProvider {
  query: (options: Record<string, unknown>) => AsyncIterable<StreamEvent>;
  sessions?: Map<string, unknown>;
  name?: string;
}

/**
 * Main chat endpoint with streaming
 */
app.post('/api/chat', async (req: Request, res: Response) => {
  const {
    message,
    chatId,
    userId = 'default-user',
    provider: providerName = 'antigravity',
    model = null,
  } = req.body as ChatRequest & { userId?: string };

  console.log('[CHAT] Request:', { message: message?.slice(0, 50), chatId, provider: providerName });

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: StreamEvent) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  sendEvent({ type: 'connected', message: 'Processing request...' });

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  try {
    // Check if message triggers a skill
    const triggeredSkills = skillsManager.findByKeyword(message);
    if (triggeredSkills.length > 0) {
      const triggeredSkill = triggeredSkills[0];
      sendEvent({ type: 'status', message: `Running skill: ${triggeredSkill.name}` });

      const skillResult = await skillsManager.execute(triggeredSkill.id, { message, chatId });
      sendEvent({ type: 'text', content: `[Skill: ${triggeredSkill.name}]\n${JSON.stringify(skillResult, null, 2)}` });

      clearInterval(heartbeatInterval);
      res.end();
      return;
    }

    // Get provider and stream response
    const provider = getProviderInstance(providerName || 'antigravity');

    if (!provider) {
      sendEvent({ type: 'error', message: `Provider ${providerName} not available` });
      clearInterval(heartbeatInterval);
      res.end();
      return;
    }

    // Stream from provider
    const queryOptions = {
      prompt: message,
      chatId,
      userId,
      model,
      maxTurns: 20,
    };

    // Handle Ollama provider specially
    if (providerName === 'ollama') {
      const isAvailable = await ollamaProvider.isAvailable();
      if (!isAvailable) {
        sendEvent({ type: 'error', message: 'Ollama is not running. Please start Ollama first.' });
        clearInterval(heartbeatInterval);
        res.end();
        return;
      }

      for await (const chunk of ollamaProvider.query({
        prompt: message,
        chatId,
        model: model || 'llama3.2',
      })) {
        sendEvent(chunk);
      }
    }
    // Handle Gemini Computer Use
    else if (providerName === 'gemini-computer-use') {
      await geminiComputerUse.initialize();

      for await (const chunk of geminiComputerUse.query({
        prompt: message,
        chatId,
      })) {
        sendEvent(chunk);
      }
    }
    // Handle legacy providers
    else if (provider && typeof (provider as LegacyProvider).query === 'function') {
      try {
        for await (const chunk of (provider as LegacyProvider).query(queryOptions)) {
          sendEvent(chunk);
        }
      } catch (streamError) {
        console.error('[CHAT] Stream error:', streamError);
        sendEvent({ type: 'error', message: (streamError as Error).message });
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
    sendEvent({ type: 'error', message: (error as Error).message });
    res.end();
  }
});

/**
 * Get available providers
 */
app.get('/api/providers', async (_req: Request, res: Response) => {
  const providers: string[] = ['antigravity', 'claude', 'opencode'];

  // Check Ollama availability
  const ollamaAvailable = await ollamaProvider.isAvailable();
  if (ollamaAvailable) {
    providers.push('ollama');
  }

  // Gemini Computer Use is always available (requires API key)
  if (process.env.GOOGLE_API_KEY) {
    providers.push('gemini-computer-use');
  }

  res.json({
    providers,
    default: 'antigravity',
    ollama: {
      available: ollamaAvailable,
      models: ollamaAvailable ? await ollamaProvider.getModels() : [],
    },
  });
});

/**
 * Get Ollama models
 */
app.get('/api/ollama/models', async (_req: Request, res: Response) => {
  const isAvailable = await ollamaProvider.isAvailable();
  if (!isAvailable) {
    return res.status(503).json({ error: 'Ollama not available' });
  }

  const models = await ollamaProvider.getModels();
  res.json({ models });
});

/**
 * Pull an Ollama model
 */
app.post('/api/ollama/pull', async (req: Request, res: Response) => {
  const { model } = req.body;

  if (!model) {
    return res.status(400).json({ error: 'Model name required' });
  }

  // Stream pull progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const progress of ollamaProvider.pullModel(model)) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    res.end();
  }
});

/**
 * Skills endpoints
 */
app.get('/api/skills', (_req: Request, res: Response) => {
  res.json({ skills: skillsManager.getAll() });
});

app.post('/api/skills', async (req: Request, res: Response) => {
  const skill = req.body;
  try {
    const created = await skillsManager.create(skill);
    res.json({ skill: created });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put('/api/skills/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updates = req.body;
  try {
    const updated = await skillsManager.update(id, updates);
    res.json({ skill: updated });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.delete('/api/skills/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const success = await skillsManager.delete(id);
  res.json({ success });
});

app.post('/api/skills/:id/run', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const context = req.body;

  try {
    const result = await skillsManager.execute(id, context);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Permission endpoints
 */
app.get('/api/pending-permissions', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const pending = sandbox.getPendingPermissions(sessionId);

  res.json({ pending, count: pending.length });
});

app.post('/api/confirm-permission', (req: Request, res: Response) => {
  const { permissionId } = req.body as { permissionId: string };

  const perm = sandbox.approvePermission(permissionId);
  if (!perm) {
    return res.json({ error: 'Permission not found' });
  }

  res.json({ approved: true, path: perm.path });
});

app.post('/api/deny-permission', (req: Request, res: Response) => {
  const { permissionId } = req.body as { permissionId: string };

  const perm = sandbox.denyPermission(permissionId);
  if (!perm) {
    return res.json({ error: 'Permission not found' });
  }

  res.json({ denied: true, path: perm.path });
});

/**
 * Sandbox operations - validate path access
 */
app.post('/api/sandbox/validate', async (req: Request, res: Response) => {
  const { path: targetPath, operation, sessionId = 'default' } = req.body;

  const result = await sandbox.validateOperation({
    path: targetPath,
    operation: operation as 'read' | 'write' | 'delete' | 'execute',
    sessionId,
  });

  res.json(result);
});

/**
 * Health check
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  const ollamaAvailable = await ollamaProvider.isAvailable();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: {
      ollama: ollamaAvailable,
      geminiComputerUse: !!process.env.GOOGLE_API_KEY,
      skills: true,
      sandbox: true,
    },
  });
});

/**
 * Browser extension status
 */
app.get('/api/browser-status', (_req: Request, res: Response) => {
  res.json({
    connected: browserExtension?.readyState === WebSocket.OPEN,
    available: !!browserExtension,
  });
});

// Create HTTP server
const httpServer = http.createServer(app);

// WebSocket server for browser extension
const wss = new WebSocketServer({ server: httpServer, path: '/browser' });

wss.on('connection', (ws, req) => {
  console.log('[WS] Browser extension connected from:', req.socket.remoteAddress);
  browserExtension = ws;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[WS] Received:', message.type || message.action);

      if (message.type === 'register') {
        console.log('[WS] Extension registered:', message.client, 'v' + message.version);
        ws.send(JSON.stringify({ type: 'registered', status: 'ok' }));
      } else if (message.type === 'result' || message.type === 'error') {
        const pending = pendingBrowserRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingBrowserRequests.delete(message.id);

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
    if (browserExtension === ws) {
      browserExtension = null;
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

/**
 * Send command to browser extension
 */
export async function sendBrowserCommand(action: string, params: Record<string, unknown>): Promise<unknown> {
  if (!browserExtension || browserExtension.readyState !== WebSocket.OPEN) {
    throw new Error('Browser extension not connected');
  }

  const id = ++requestIdCounter;
  const message = { id, action, params };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingBrowserRequests.delete(id);
      reject(new Error(`Browser command ${action} timed out`));
    }, 30000);

    pendingBrowserRequests.set(id, { resolve, reject, timeout });
    browserExtension!.send(JSON.stringify(message));
  });
}

// Initialize and start server
async function start() {
  console.log('\n🚀 Nimbus AI Agent v2.0.0\n');

  // Initialize sandbox
  await sandbox.initialize();

  // Initialize skills
  await skillsManager.initialize();

  // Load legacy providers
  legacyProviders = await loadLegacyProviders();

  // Check Ollama
  const ollamaAvailable = await ollamaProvider.isAvailable();
  if (ollamaAvailable) {
    const models = await ollamaProvider.getModels();
    console.log(`✓ Ollama available with ${models.length} models`);
  } else {
    console.log('○ Ollama not running (optional)');
  }

  // Check Gemini Computer Use
  if (process.env.GOOGLE_API_KEY) {
    console.log('✓ Gemini Computer Use enabled');
  } else {
    console.log('○ Gemini Computer Use disabled (no GOOGLE_API_KEY)');
  }

  // Load skills
  const skills = skillsManager.getAll();
  console.log(`✓ Skills loaded: ${skills.length} skills`);

  // Start server
  httpServer.listen(PORT, () => {
    console.log(`\n✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Chat endpoint: POST http://localhost:${PORT}/api/chat`);
    console.log(`✓ WebSocket: ws://localhost:${PORT}/browser`);
    console.log(`✓ Health check: GET http://localhost:${PORT}/api/health\n`);
  });
}

start().catch(console.error);

export { app, httpServer };
