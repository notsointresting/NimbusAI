import { BaseProvider } from './base-provider.js';
import { TOOL_DEFINITIONS, executeTool, setSessionId } from '../tools/index.js';

/**
 * Antigravity Provider - Full Autonomous Agent
 * Works with both Claude and Gemini models through antigravity-claude-proxy
 * Features:
 * - Streaming responses for fast output
 * - Full tool execution (files, bash, web, todos)
 * - Multi-turn agentic loop
 * - Works with ANY model (Claude or Gemini)
 */
export class AntigravityProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.proxyUrl = config.proxyUrl || process.env.ANTIGRAVITY_PROXY_URL || 'http://localhost:8080';
    // Use faster non-thinking model by default for quick responses
    this.model = config.model || process.env.ANTIGRAVITY_MODEL || 'claude-sonnet-4-5';
    this.thinkingModel = 'claude-sonnet-4-5-thinking'; // For complex tasks
    this.maxTurns = config.maxTurns || 50;
    this.maxTokens = config.maxTokens || 8192; // Reduced for faster responses

    // Conversation history per chat
    this.conversationHistory = new Map();
  }

  /**
   * Determine if task is complex and needs thinking model
   */
  needsThinkingModel(prompt) {
    const complexPatterns = [
      /debug|fix.*bug|investigate|analyze.*code/i,
      /architect|design|plan.*implementation/i,
      /refactor|optimize.*algorithm/i,
      /security|vulnerability|audit/i,
      /complex|difficult|challenging/i
    ];
    return complexPatterns.some(p => p.test(prompt));
  }

  get name() {
    return 'antigravity';
  }

  async initialize() {
    console.log(`[Antigravity] Proxy: ${this.proxyUrl}`);
    console.log(`[Antigravity] Model: ${this.model}`);
    console.log(`[Antigravity] Tools: ${TOOL_DEFINITIONS.length} available`);

    try {
      const response = await fetch(`${this.proxyUrl}/health`);
      if (response.ok) {
        console.log('[Antigravity] Proxy connected');
      }
    } catch (error) {
      console.warn('[Antigravity] Proxy not available:', error.message);
    }
  }

  getConversationHistory(chatId) {
    if (!this.conversationHistory.has(chatId)) {
      this.conversationHistory.set(chatId, []);
    }
    return this.conversationHistory.get(chatId);
  }

  addToHistory(chatId, message) {
    const history = this.getConversationHistory(chatId);
    history.push(message);
    if (history.length > 100) {
      history.splice(0, history.length - 80);
    }
  }

  getSystemPrompt() {
    return `You are a fully autonomous AI agent with complete system access. You operate as a powerful desktop assistant that can manage files, execute code, search the web, create documents, and complete complex multi-step tasks independently.

## Core Capabilities

### Direct File System Access
You have unrestricted read/write access to the local file system. You can:
- Organize, edit, and create files in any folder
- Process hundreds of files (sorting, renaming, categorizing)
- Create expense reports from receipts, format documents, batch rename with patterns
- Generate polished deliverables (spreadsheets, documents, presentations)

### Autonomous Task Execution
- Break complex work into smaller tasks using TodoWrite
- Report progress to keep user informed using Progress tool
- Work independently on long-running operations (up to 50 turns)
- Complete tasks fully without unnecessary user interaction

### Available Tools

#### File Operations
- **Read**: Read file contents (ALWAYS read before editing)
- **Write**: Create or overwrite files with any content
- **Edit**: Replace specific text in files
- **Glob**: Find files by pattern (\`**/*.js\`, \`src/**/*.ts\`)
- **Grep**: Search file contents with regex
- **ListDir**: List directory contents with sizes
- **MakeDir**: Create directories (including parents)
- **Move**: Move or rename files/directories
- **Copy**: Copy files or entire directories
- **Delete**: Request deletion (REQUIRES user approval - see below)
- **ConfirmDelete**: Execute approved deletion
- **CancelDelete**: Cancel pending deletion

#### System
- **Bash**: Execute any shell command (git, npm, python, node, etc.)
  - Run builds, tests, installations
  - Execute scripts and system utilities
  - Access all CLI tools available on the system

#### Web & Research
- **WebSearch**: Search the internet via DuckDuckGo
- **WebFetch**: Fetch and extract content from any URL

#### Task Management & Progress
- **TodoWrite**: Create and manage multi-step task lists
- **TodoRead**: View current task status
- **Progress**: Report current step/progress to user (use frequently!)

#### Analysis
- **CodeAnalysis**: Analyze code structure, dependencies, patterns

#### Computer Use (Browser Automation)
- **Screenshot**: Take a screenshot of the current screen
- **MouseClick**: Click at specific screen coordinates (0-1000 scaled grid)
- **TypeText**: Type text at the current cursor position
- **KeyPress**: Press key combinations (Control+C, Alt+Tab, Enter, etc.)
- **OpenBrowser**: Open a web browser and navigate to a URL
- **Scroll**: Scroll the screen up/down/left/right
- **Wait**: Wait for a specified duration (useful between UI actions)

## Important Guidelines

### Deletion Protection
- The Delete tool ONLY creates a pending deletion request
- Deletions require explicit user approval before execution
- Always provide a clear reason when requesting deletions
- Use ConfirmDelete only after user approves

### Progress Transparency
- Use the Progress tool frequently to show what you're doing
- Report each major step: "Reading files...", "Analyzing data...", "Writing output..."
- This keeps the user informed during long operations

### Task Management
- For any task with 3+ steps, create a TodoWrite list first
- Mark tasks in_progress when starting, completed when done
- Break complex work into clear, trackable subtasks

### Best Practices
1. **Always read before editing** - Never guess file contents
2. **Verify after actions** - Confirm files were created/modified correctly
3. **Use absolute paths** - Avoid relative path confusion
4. **Report progress** - Keep user informed on long operations
5. **Handle errors gracefully** - Explain what went wrong and how to fix

### Document Generation Patterns
- **Spreadsheets**: Use Python/Node to generate Excel files with formulas
- **Reports**: Create Markdown, HTML, or PDF formatted documents
- **Data files**: Generate CSV, JSON, or structured data formats

## Working Directory
${process.cwd()}

## Execution Style
- Take full initiative - complete the entire task autonomously
- Don't ask for confirmation on every step (except deletions)
- Make reasonable decisions and explain your approach
- If something fails, try alternative approaches before giving up
- Think step-by-step for complex problems`;
  }

  /**
   * Main query method with streaming agentic loop
   */
  async *query(params) {
    const { prompt, chatId, model } = params;

    // Smart model selection - use thinking model only for complex tasks
    const selectedModel = model || (this.needsThinkingModel(prompt) ? this.thinkingModel : this.model);

    // Set session for tools
    setSessionId(chatId);

    // Add user message
    this.addToHistory(chatId, { role: 'user', content: prompt });

    yield { type: 'session_init', session_id: chatId, provider: this.name };

    console.log(`[Antigravity] Starting with ${selectedModel}`);

    let turn = 0;
    let continueLoop = true;

    while (continueLoop && turn < this.maxTurns) {
      turn++;
      console.log(`[Antigravity] Turn ${turn}`);

      try {
        // Use streaming for faster response
        const response = await this.makeStreamingRequest(chatId, selectedModel);

        if (!response.ok) {
          const error = await response.text();
          console.error('[Antigravity] API Error:', error);
          yield { type: 'error', message: `API error: ${response.status}`, provider: this.name };
          break;
        }

        // Process streaming response
        const result = await this.processStream(response, chatId);

        // Yield all text chunks
        for (const chunk of result.textChunks) {
          yield chunk;
        }

        // Yield thinking if any
        if (result.thinking) {
          yield { type: 'thinking', content: result.thinking, provider: this.name };
        }

        // Process tool calls
        if (result.toolCalls.length > 0) {
          const toolResults = [];

          for (const toolCall of result.toolCalls) {
            yield {
              type: 'tool_use',
              name: toolCall.name,
              input: toolCall.input,
              id: toolCall.id,
              provider: this.name
            };

            console.log(`[Antigravity] Tool: ${toolCall.name}`);
            const toolResult = await executeTool(toolCall.name, toolCall.input);

            yield {
              type: 'tool_result',
              result: toolResult,
              tool_use_id: toolCall.id,
              name: toolCall.name,
              provider: this.name
            };

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(toolResult)
            });
          }

          // Add assistant response to history
          this.addToHistory(chatId, {
            role: 'assistant',
            content: result.assistantContent
          });

          // Add tool results
          this.addToHistory(chatId, {
            role: 'user',
            content: toolResults
          });

          // Continue loop
          console.log('[Antigravity] Tools executed, continuing...');
        } else {
          // No tools, we're done
          if (result.assistantContent.length > 0) {
            this.addToHistory(chatId, {
              role: 'assistant',
              content: result.assistantContent
            });
          }
          continueLoop = false;
        }

        // Check stop condition
        if (result.stopReason === 'end_turn' && result.toolCalls.length === 0) {
          continueLoop = false;
        }

      } catch (error) {
        console.error(`[Antigravity] Turn ${turn} error:`, error);
        yield { type: 'error', message: error.message, provider: this.name };
        break;
      }
    }

    if (turn >= this.maxTurns) {
      yield { type: 'text', content: '\n\n[Reached maximum turns]', provider: this.name };
    }

    yield { type: 'done', provider: this.name };
    console.log(`[Antigravity] Done in ${turn} turns`);
  }

  /**
   * Make streaming request to proxy
   */
  async makeStreamingRequest(chatId, model) {
    const messages = this.getConversationHistory(chatId);

    const body = {
      model,
      max_tokens: this.maxTokens,
      system: this.getSystemPrompt(),
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: 'auto' },
      stream: true
    };

    // Add thinking for thinking models (reduced budget for faster responses)
    if (model.includes('thinking')) {
      body.thinking = { type: 'enabled', budget_tokens: 4000 };
    }

    return fetch(`${this.proxyUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'antigravity-proxy',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Process SSE stream
   */
  async processStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const textChunks = [];
    const toolCalls = [];
    const assistantContent = [];
    let thinking = '';
    let stopReason = null;
    let currentToolCall = null;
    let currentToolInput = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                currentToolCall = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: {}
                };
                currentToolInput = '';
              }
              break;

            case 'content_block_delta':
              const delta = event.delta;
              if (delta?.type === 'text_delta' && delta.text) {
                textChunks.push({
                  type: 'text',
                  content: delta.text,
                  provider: this.name
                });
                assistantContent.push({ type: 'text', text: delta.text });
              } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                thinking += delta.thinking;
              } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                currentToolInput += delta.partial_json;
              }
              break;

            case 'content_block_stop':
              if (currentToolCall) {
                try {
                  currentToolCall.input = JSON.parse(currentToolInput || '{}');
                } catch {
                  currentToolCall.input = {};
                }
                toolCalls.push(currentToolCall);
                assistantContent.push({
                  type: 'tool_use',
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  input: currentToolCall.input
                });
                currentToolCall = null;
                currentToolInput = '';
              }
              break;

            case 'message_delta':
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
              break;
          }
        } catch {
          // Skip parse errors
        }
      }
    }

    return { textChunks, toolCalls, assistantContent, thinking, stopReason };
  }

  async cleanup() {
    this.conversationHistory.clear();
    await super.cleanup();
  }
}
