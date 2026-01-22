import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { HomeView } from './components/HomeView';
import { SettingsView } from './components/SettingsView';
import { SkillsView } from './components/SkillsView';
import { PermissionDialog } from './components/PermissionDialog';
import { ToastContainer } from './components/Toast';
import { useChat } from './hooks/useChat';
import { usePermissions } from './hooks/usePermissions';
import type { Chat, ProviderType } from '@shared/types';

type View = 'home' | 'chat' | 'settings' | 'skills';

function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [provider, setProvider] = useState<ProviderType>('antigravity');
  const [model, setModel] = useState('claude-sonnet-4-5');

  const {
    chats,
    createChat,
    deleteChat,
    sendMessage,
    isLoading,
    streamingContent,
    todos,
    toolCalls,
  } = useChat();

  const {
    pendingPermission,
    approvePermission,
    denyPermission,
  } = usePermissions(currentChat?.id);

  const handleNewChat = useCallback(() => {
    const chat = createChat(provider, model);
    setCurrentChat(chat);
    setCurrentView('chat');
  }, [createChat, provider, model]);

  const handleSelectChat = useCallback((chat: Chat) => {
    setCurrentChat(chat);
    setCurrentView('chat');
  }, []);

  const handleSendMessage = useCallback(async (message: string, attachments?: File[]) => {
    if (!currentChat) {
      const chat = createChat(provider, model);
      setCurrentChat(chat);
      await sendMessage(chat.id, message, provider, model);
      setCurrentView('chat');
    } else {
      await sendMessage(currentChat.id, message, provider, model);
    }
  }, [currentChat, createChat, sendMessage, provider, model]);

  const handleDeleteChat = useCallback((chatId: string) => {
    deleteChat(chatId);
    if (currentChat?.id === chatId) {
      setCurrentChat(null);
      setCurrentView('home');
    }
  }, [deleteChat, currentChat]);

  return (
    <div className="app">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        chats={chats}
        currentChatId={currentChat?.id}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNavigate={setCurrentView}
        currentView={currentView}
      />

      <main className="main-content">
        {currentView === 'home' && (
          <HomeView
            onSendMessage={handleSendMessage}
            provider={provider}
            model={model}
            onProviderChange={setProvider}
            onModelChange={setModel}
            isLoading={isLoading}
          />
        )}

        {currentView === 'chat' && currentChat && (
          <ChatView
            chat={currentChat}
            onSendMessage={(msg) => handleSendMessage(msg)}
            isLoading={isLoading}
            streamingContent={streamingContent}
            todos={todos}
            toolCalls={toolCalls}
            provider={provider}
            model={model}
            onProviderChange={setProvider}
            onModelChange={setModel}
          />
        )}

        {currentView === 'settings' && (
          <SettingsView />
        )}

        {currentView === 'skills' && (
          <SkillsView />
        )}
      </main>

      {pendingPermission && (
        <PermissionDialog
          permission={pendingPermission}
          onApprove={() => approvePermission(pendingPermission.id)}
          onDeny={() => denyPermission(pendingPermission.id)}
        />
      )}

      <ToastContainer />
    </div>
  );
}

export default App;
