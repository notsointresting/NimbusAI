/**
 * Shared Types for Nimbus AI Agent
 */

// ==================== Provider Types ====================

export type ProviderType = 'antigravity' | 'ollama' | 'claude' | 'opencode' | 'gemini-computer-use';

export interface ProviderConfig {
  name: ProviderType;
  displayName: string;
  description: string;
  models: ModelConfig[];
  enabled: boolean;
  requiresApiKey: boolean;
  baseUrl?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  supportsThinking?: boolean;
  supportsComputerUse?: boolean;
  contextWindow?: number;
  isDefault?: boolean;
}

// ==================== Message Types ====================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  thinking?: string;
  attachments?: Attachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: ToolResult;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Attachment {
  id: string;
  type: 'file' | 'image' | 'url';
  name: string;
  content?: string;
  url?: string;
  mimeType?: string;
}

// ==================== Chat Types ====================

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  provider: ProviderType;
  model: string;
  todos?: TodoItem[];
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

// ==================== Permission Types ====================

export interface Permission {
  id: string;
  type?: string;
  path: string;
  operation: 'read' | 'write' | 'delete' | 'execute' | 'list' | string;
  reason?: string;
  status?: 'pending' | 'approved' | 'denied';
  sessionId?: string;
  requestedAt?: Date;
}

export interface SandboxConfig {
  allowedPaths: string[];
  deniedPaths: string[];
  requireApproval: boolean;
  sensitivePaths: string[];
}

// ==================== Skill Types ====================

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  trigger: SkillTrigger;
  steps: SkillStep[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillTrigger {
  type: 'manual' | 'keyword' | 'schedule' | 'event';
  value?: string;
  schedule?: string; // cron expression
}

export interface SkillStep {
  id: string;
  type: 'tool' | 'prompt' | 'condition' | 'loop';
  tool?: string;
  input?: Record<string, unknown>;
  prompt?: string;
  condition?: string;
  onSuccess?: string; // next step id
  onFailure?: string; // next step id
}

export interface SkillExecution {
  id: string;
  skillId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  steps: SkillStepExecution[];
  error?: string;
}

export interface SkillStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ==================== Computer Use Types ====================

export interface ComputerUseAction {
  type: 'click' | 'type' | 'scroll' | 'screenshot' | 'navigate' | 'wait';
  x?: number;
  y?: number;
  text?: string;
  url?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  duration?: number;
}

export interface BrowserState {
  url: string;
  title: string;
  screenshot?: string; // base64
  viewport: { width: number; height: number };
}

// ==================== Stream Types ====================

export interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'permission_required' | 'connected' | 'status';
  content?: string;
  message?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  result?: unknown;
  toolCall?: ToolCall;
  permission?: Permission;
  error?: string;
}

// ==================== API Types ====================

export interface ChatRequest {
  message: string;
  chatId: string;
  userId?: string;
  provider?: ProviderType;
  model?: string | null;
  attachments?: Attachment[];
}

export interface ChatResponse {
  type: 'stream';
  events: AsyncIterable<StreamEvent>;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  providers: ProviderType[];
  version: string;
  timestamp: string;
}
