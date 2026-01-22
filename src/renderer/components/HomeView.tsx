import { useState, useCallback, FormEvent, KeyboardEvent } from 'react';
import type { ProviderType } from '@shared/types';
import './HomeView.css';

interface HomeViewProps {
  onSendMessage: (message: string) => void;
  provider: ProviderType;
  model: string;
  onProviderChange: (provider: ProviderType) => void;
  onModelChange: (model: string) => void;
  isLoading: boolean;
}

const PROVIDERS = [
  { id: 'antigravity' as const, name: 'Antigravity Proxy', desc: 'Claude & Gemini (Free)' },
  { id: 'ollama' as const, name: 'Ollama', desc: 'Local Models' },
];

const MODELS: Record<string, { id: string; name: string; desc: string }[]> = {
  antigravity: [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', desc: 'Fast & capable' },
    { id: 'claude-sonnet-4-5-thinking', name: 'Claude Sonnet (Thinking)', desc: 'Deep reasoning' },
    { id: 'claude-opus-4-5-thinking', name: 'Claude Opus', desc: 'Most capable' },
    { id: 'gemini-2.5-flash', name: 'Gemini Flash', desc: 'Very fast' },
    { id: 'gemini-2.5-pro', name: 'Gemini Pro', desc: 'Balanced' },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2', desc: 'General purpose' },
    { id: 'codellama', name: 'Code Llama', desc: 'Code generation' },
    { id: 'mistral', name: 'Mistral 7B', desc: 'Fast & capable' },
    { id: 'deepseek-coder-v2', name: 'DeepSeek Coder', desc: 'Excellent coding' },
  ],
  claude: [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', desc: 'Fast & capable' },
  ],
  opencode: [
    { id: 'default', name: 'Default', desc: 'Default OpenCode model' },
  ],
  'gemini-computer-use': [
    { id: 'gemini-2.5-flash-preview-native-audio-dialog', name: 'Gemini Computer Use', desc: 'Browser automation' },
  ],
};

export function HomeView({
  onSendMessage,
  provider,
  model,
  onProviderChange,
  onModelChange,
  isLoading,
}: HomeViewProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;
    onSendMessage(message.trim());
    setMessage('');
  }, [message, isLoading, onSendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }, [handleSubmit]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="home-view">
      <div className="home-content">
        <div className="greeting-section">
          <h1 className="greeting">{getGreeting()}</h1>
          <p className="tagline">What would you like to accomplish today?</p>
        </div>

        <form className="message-form" onSubmit={handleSubmit}>
          <div className="input-container">
            <textarea
              className="message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to organize files, write code, search the web, automate tasks..."
              rows={3}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!message.trim() || isLoading}
            >
              {isLoading ? (
                <div className="spinner" />
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>

          <div className="model-selector">
            <div className="selector-group">
              <label>Provider</label>
              <select
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as ProviderType)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-group">
              <label>Model</label>
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {(MODELS[provider] || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <div className="action-grid">
            <button className="action-card" onClick={() => onSendMessage('Organize my Downloads folder by file type')}>
              <span className="action-icon">📁</span>
              <span className="action-label">Organize Downloads</span>
            </button>
            <button className="action-card" onClick={() => onSendMessage('Search the web for latest tech news and summarize')}>
              <span className="action-icon">🔍</span>
              <span className="action-label">Web Search</span>
            </button>
            <button className="action-card" onClick={() => onSendMessage('Analyze my current project and suggest improvements')}>
              <span className="action-icon">💡</span>
              <span className="action-label">Code Review</span>
            </button>
            <button className="action-card" onClick={() => onSendMessage('Create a simple Python script that...')}>
              <span className="action-icon">🐍</span>
              <span className="action-label">Write Code</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeView;
