import { memo } from 'react';
import type { Chat } from '@shared/types';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  chats: Chat[];
  currentChatId?: string;
  onNewChat: () => void;
  onSelectChat: (chat: Chat) => void;
  onDeleteChat: (chatId: string) => void;
  onNavigate: (view: 'home' | 'chat' | 'settings' | 'skills') => void;
  currentView: string;
}

export const Sidebar = memo(function Sidebar({
  collapsed,
  onToggle,
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onNavigate,
  currentView,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="sidebar-toggle" onClick={onToggle}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        {!collapsed && (
          <div className="sidebar-brand">
            <span className="brand-icon">☁️</span>
            <span className="brand-text">Nimbus</span>
          </div>
        )}
      </div>

      <div className="sidebar-content">
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && <span>New Chat</span>}
        </button>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => onNavigate('home')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {!collapsed && <span>Home</span>}
          </button>

          <button
            className={`nav-item ${currentView === 'skills' ? 'active' : ''}`}
            onClick={() => onNavigate('skills')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            {!collapsed && <span>Skills</span>}
          </button>

          <button
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!collapsed && <span>Settings</span>}
          </button>
        </nav>

        {!collapsed && chats.length > 0 && (
          <div className="chat-history">
            <h3 className="chat-history-title">Recent Chats</h3>
            <div className="chat-list">
              {chats.slice(0, 10).map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-item ${chat.id === currentChatId ? 'active' : ''}`}
                  onClick={() => onSelectChat(chat)}
                >
                  <span className="chat-item-title">{chat.title}</span>
                  <button
                    className="chat-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="connection-status">
            <div className="status-item">
              <span className="status-dot connected" />
              <span>Proxy</span>
            </div>
            <div className="status-item">
              <span className="status-dot disconnected" />
              <span>Browser</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});

export default Sidebar;
