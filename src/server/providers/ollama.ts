/**
 * Ollama Provider - Local LLM Support
 * Connects to locally running Ollama instance for offline AI
 */

import { Ollama } from 'ollama';
import type { ProviderConfig, ModelConfig, StreamEvent, ChatMessage } from '@shared/types';

export class OllamaProvider {
  private client: Ollama;
  private baseUrl: string;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.client = new Ollama({ host: baseUrl });
  }

  get name(): string {
    return 'ollama';
  }

  get config(): ProviderConfig {
    return {
      name: 'ollama',
      displayName: 'Ollama (Local)',
      description: 'Run AI models locally on your machine',
      models: [],
      enabled: true,
      requiresApiKey: false,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * Check if Ollama is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of installed models
   */
  async getModels(): Promise<ModelConfig[]> {
    try {
      const response = await this.client.list();
      return response.models.map((model) => ({
        id: model.name,
        name: model.name.split(':')[0],
        description: `${(model.size / 1e9).toFixed(1)}GB - ${model.details?.family || 'Unknown'}`,
        contextWindow: model.details?.parameter_size ? parseInt(model.details.parameter_size) : undefined,
      }));
    } catch (error) {
      console.error('[Ollama] Failed to list models:', error);
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry - yields progress updates
   */
  async *pullModel(modelName: string): AsyncGenerator<{ status: string; progress?: number; completed?: number; total?: number }> {
    try {
      const stream = await this.client.pull({ model: modelName, stream: true });

      for await (const part of stream) {
        yield {
          status: part.status,
          completed: part.completed,
          total: part.total,
          progress: part.completed && part.total ? (part.completed / part.total) * 100 : undefined,
        };
      }
    } catch (error) {
      console.error('[Ollama] Failed to pull model:', error);
      throw error;
    }
  }

  /**
   * Get conversation history for a chat
   */
  private getHistory(chatId: string): ChatMessage[] {
    if (!this.conversationHistory.has(chatId)) {
      this.conversationHistory.set(chatId, []);
    }
    return this.conversationHistory.get(chatId)!;
  }

  /**
   * Add message to history
   */
  private addToHistory(chatId: string, message: ChatMessage): void {
    const history = this.getHistory(chatId);
    history.push(message);
    // Keep last 50 messages
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  /**
   * Query the model with streaming
   */
  async *query(params: {
    prompt: string;
    chatId: string;
    model?: string;
    systemPrompt?: string;
  }): AsyncGenerator<StreamEvent> {
    const { prompt, chatId, model = 'llama3.2', systemPrompt } = params;

    // Add user message to history
    this.addToHistory(chatId, {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    });

    const history = this.getHistory(chatId);

    try {
      const messages = history.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      }));

      if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
      }

      const response = await this.client.chat({
        model,
        messages,
        stream: true,
      });

      let fullContent = '';

      for await (const part of response) {
        if (part.message?.content) {
          fullContent += part.message.content;
          yield {
            type: 'text',
            content: part.message.content,
          };
        }
      }

      // Add assistant response to history
      this.addToHistory(chatId, {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
      });

      yield { type: 'done' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield {
        type: 'error',
        error: `Ollama error: ${errorMessage}`,
      };
    }
  }

  /**
   * Generate embeddings
   */
  async embed(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const response = await this.client.embeddings({
      model,
      prompt: text,
    });
    return response.embedding;
  }

  /**
   * Clear conversation history
   */
  clearHistory(chatId?: string): void {
    if (chatId) {
      this.conversationHistory.delete(chatId);
    } else {
      this.conversationHistory.clear();
    }
  }
}

// Recommended models for different tasks
export const RECOMMENDED_OLLAMA_MODELS = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    description: 'Meta\'s latest model - great for general tasks',
    size: '2GB',
  },
  {
    id: 'llama3.2:1b',
    name: 'Llama 3.2 1B',
    description: 'Lightweight version for faster responses',
    size: '1.3GB',
  },
  {
    id: 'codellama',
    name: 'Code Llama',
    description: 'Specialized for code generation',
    size: '3.8GB',
  },
  {
    id: 'mistral',
    name: 'Mistral 7B',
    description: 'Fast and capable general-purpose model',
    size: '4.1GB',
  },
  {
    id: 'deepseek-coder-v2',
    name: 'DeepSeek Coder V2',
    description: 'Excellent for coding tasks',
    size: '8.9GB',
  },
  {
    id: 'qwen2.5-coder',
    name: 'Qwen 2.5 Coder',
    description: 'Alibaba\'s coding model',
    size: '4.7GB',
  },
];

export default OllamaProvider;
