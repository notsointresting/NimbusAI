import { useState, useCallback, useRef } from 'react';
import type { Chat, ChatMessage, TodoItem, ToolCall, ProviderType } from '@shared/types';

const API_URL = 'http://localhost:3001';

export function useChat() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const createChat = useCallback((provider: ProviderType, model: string): Chat => {
    const chat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      provider,
      model,
      todos: [],
    };

    setChats((prev) => [chat, ...prev]);
    return chat;
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
  }, []);

  const addMessage = useCallback((chatId: string, message: ChatMessage) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, message],
              updatedAt: new Date(),
              title: chat.messages.length === 0 ? message.content.slice(0, 50) : chat.title,
            }
          : chat
      )
    );
  }, []);

  const sendMessage = useCallback(
    async (chatId: string, content: string, provider: ProviderType, model: string) => {
      // Add user message
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      addMessage(chatId, userMessage);

      setIsLoading(true);
      setStreamingContent('');
      setTodos([]);
      setToolCalls([]);

      // Cancel previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: content,
            chatId,
            provider,
            model,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'text':
                  fullContent += event.content || '';
                  setStreamingContent(fullContent);
                  break;

                case 'tool_use':
                  setToolCalls((prev) => [
                    ...prev,
                    {
                      id: event.id,
                      name: event.name,
                      input: event.input,
                      status: 'running',
                    },
                  ]);
                  break;

                case 'tool_result':
                  setToolCalls((prev) =>
                    prev.map((tc) =>
                      tc.id === event.tool_use_id
                        ? { ...tc, status: 'completed', result: event.result }
                        : tc
                    )
                  );
                  break;

                case 'todos':
                  setTodos(event.todos || []);
                  break;

                case 'error':
                  console.error('Stream error:', event.message);
                  break;
              }
            } catch {
              // Skip parse errors
            }
          }
        }

        // Add assistant message
        if (fullContent) {
          const assistantMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: fullContent,
            timestamp: new Date(),
            toolCalls,
          };
          addMessage(chatId, assistantMessage);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Send message error:', error);
        }
      } finally {
        setIsLoading(false);
        setStreamingContent('');
      }
    },
    [addMessage, toolCalls]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamingContent('');
    }
  }, []);

  return {
    chats,
    createChat,
    deleteChat,
    sendMessage,
    cancelRequest,
    isLoading,
    streamingContent,
    todos,
    toolCalls,
  };
}

export default useChat;
