import { memo } from 'react';
import type { Chat, ProviderType, TodoItem, ToolCall } from '@shared/types';
import './ChatView.css';

interface ChatViewProps {
  chat: Chat;
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  streamingContent: string;
  todos: TodoItem[];
  toolCalls: ToolCall[];
  provider: ProviderType;
  model: string;
  onProviderChange: (provider: ProviderType) => void;
  onModelChange: (model: string) => void;
}

export const ChatView = memo(function ChatView({
  chat,
  onSendMessage,
  isLoading,
  streamingContent,
  todos,
  toolCalls,
}: ChatViewProps) {
  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>{chat.title}</h2>
      </div>

      <div className="chat-messages">
        {chat.messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content}
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="message assistant streaming">
            <div className="message-content">
              {streamingContent}
              <span className="cursor" />
            </div>
          </div>
        )}
      </div>

      <div className="chat-sidebar">
        {todos.length > 0 && (
          <div className="todo-panel">
            <h3>Tasks</h3>
            <ul className="todo-list">
              {todos.map((todo) => (
                <li key={todo.id} className={`todo-item ${todo.status}`}>
                  <span className="todo-status">
                    {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○'}
                  </span>
                  <span className="todo-content">{todo.content}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {toolCalls.length > 0 && (
          <div className="tools-panel">
            <h3>Tool Calls</h3>
            <ul className="tool-list">
              {toolCalls.slice(-5).map((tool) => (
                <li key={tool.id} className={`tool-item ${tool.status}`}>
                  <span className="tool-name">{tool.name}</span>
                  <span className="tool-status">{tool.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="chat-input">
        <textarea
          placeholder="Type a message..."
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const target = e.target as HTMLTextAreaElement;
              if (target.value.trim()) {
                onSendMessage(target.value.trim());
                target.value = '';
              }
            }
          }}
        />
        <button className="btn btn-primary" disabled={isLoading}>
          {isLoading ? <div className="spinner" /> : 'Send'}
        </button>
      </div>
    </div>
  );
});

export default ChatView;
