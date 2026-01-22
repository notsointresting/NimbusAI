/**
 * Gemini Computer Use Provider
 * Uses Gemini's computer use model with Playwright for browser automation
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import type { StreamEvent, ComputerUseAction, BrowserState } from '@shared/types';

export class GeminiComputerUseProvider {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private proxyUrl: string;
  private model: string = 'gemini-2.5-flash-preview-native-audio-dialog';

  constructor(proxyUrl: string = 'http://localhost:8080') {
    this.proxyUrl = proxyUrl;
  }

  get name(): string {
    return 'gemini-computer-use';
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    console.log('[GeminiComputerUse] Launching browser...');
    this.browser = await chromium.launch({
      headless: false, // Show browser for computer use
      args: ['--start-maximized'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    this.page = await this.context.newPage();
    console.log('[GeminiComputerUse] Browser ready');
  }

  /**
   * Get current browser state with screenshot
   */
  async getBrowserState(): Promise<BrowserState> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const screenshot = await this.page.screenshot({ type: 'png' });

    return {
      url: this.page.url(),
      title: await this.page.title(),
      screenshot: screenshot.toString('base64'),
      viewport: { width: 1280, height: 720 },
    };
  }

  /**
   * Execute a computer use action
   */
  async executeAction(action: ComputerUseAction): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    console.log('[GeminiComputerUse] Executing action:', action.type);

    switch (action.type) {
      case 'click':
        if (action.x !== undefined && action.y !== undefined) {
          await this.page.mouse.click(action.x, action.y);
        }
        break;

      case 'type':
        if (action.text) {
          await this.page.keyboard.type(action.text, { delay: 50 });
        }
        break;

      case 'scroll':
        const scrollAmount = action.amount || 500;
        if (action.direction === 'down') {
          await this.page.mouse.wheel(0, scrollAmount);
        } else if (action.direction === 'up') {
          await this.page.mouse.wheel(0, -scrollAmount);
        }
        break;

      case 'navigate':
        if (action.url) {
          await this.page.goto(action.url, { waitUntil: 'domcontentloaded' });
        }
        break;

      case 'wait':
        await new Promise((resolve) => setTimeout(resolve, action.duration || 1000));
        break;

      case 'screenshot':
        // Already handled in getBrowserState
        break;
    }
  }

  /**
   * Send request to Gemini through proxy with computer use capabilities
   */
  async *query(params: {
    prompt: string;
    chatId: string;
  }): AsyncGenerator<StreamEvent> {
    const { prompt, chatId } = params;

    try {
      // Initialize browser if needed
      await this.initialize();

      // Get current browser state
      const browserState = await this.getBrowserState();

      yield {
        type: 'text',
        content: `Analyzing screen... (${browserState.url})\n`,
      };

      // Build request with screenshot
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: browserState.screenshot,
              },
            },
          ],
        },
      ];

      const response = await fetch(`${this.proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'antigravity-proxy',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          messages,
          tools: this.getComputerUseTools(),
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

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

            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if (delta?.type === 'text_delta' && delta.text) {
                yield { type: 'text', content: delta.text };
              }
            }

            // Handle tool use for computer actions
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              const toolName = event.content_block.name;
              yield { type: 'text', content: `\n🖱️ Executing: ${toolName}\n` };
            }
          } catch {
            // Skip parse errors
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', error: errorMessage };
    }
  }

  /**
   * Get computer use tool definitions
   */
  private getComputerUseTools() {
    return [
      {
        name: 'computer_click',
        description: 'Click at specific coordinates on the screen',
        input_schema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            button: { type: 'string', enum: ['left', 'right', 'middle'] },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'computer_type',
        description: 'Type text at the current cursor position',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['text'],
        },
      },
      {
        name: 'computer_scroll',
        description: 'Scroll the page',
        input_schema: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['up', 'down'] },
            amount: { type: 'number', description: 'Scroll amount in pixels' },
          },
          required: ['direction'],
        },
      },
      {
        name: 'computer_navigate',
        description: 'Navigate to a URL',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' },
          },
          required: ['url'],
        },
      },
      {
        name: 'computer_screenshot',
        description: 'Take a screenshot of the current screen',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<BrowserState> {
    await this.initialize();
    if (!this.page) throw new Error('Browser not initialized');

    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    return this.getBrowserState();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

export default GeminiComputerUseProvider;
