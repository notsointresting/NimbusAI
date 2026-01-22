/**
 * Open Claude Cowork - Popup Script
 * Controls the extension popup UI
 */

// Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const wsUrl = document.getElementById('ws-url');
const reconnectBtn = document.getElementById('reconnect-btn');
const testBtn = document.getElementById('test-btn');
const recentList = document.getElementById('recent-list');

// Recent actions storage
let recentActions = [];

// Update status display
function updateStatus(connected) {
  statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  statusText.textContent = connected ? 'Connected' : 'Disconnected';
  reconnectBtn.disabled = connected;
}

// Add action to recent list
function addRecentAction(action) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  recentActions.unshift({ time, action });
  recentActions = recentActions.slice(0, 5); // Keep last 5

  renderRecentActions();

  // Save to storage
  chrome.storage.local.set({ recentActions });
}

// Render recent actions list
function renderRecentActions() {
  if (recentActions.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No actions yet</div>';
    return;
  }

  recentList.innerHTML = recentActions.map(item => `
    <div class="action-item">
      <span class="action-time">${item.time}</span>
      ${item.action}
    </div>
  `).join('');
}

// Check connection status
async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
    updateStatus(response?.connected || false);
  } catch (error) {
    console.error('Failed to get status:', error);
    updateStatus(false);
  }
}

// Reconnect to backend
async function reconnect() {
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = 'Connecting...';

  try {
    await chrome.runtime.sendMessage({ type: 'reconnect' });
    addRecentAction('Manual reconnect initiated');

    // Check status after a short delay
    setTimeout(checkStatus, 1000);
  } catch (error) {
    console.error('Reconnect failed:', error);
  } finally {
    reconnectBtn.textContent = 'Reconnect';
  }
}

// Test connection with a simple action
async function testConnection() {
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      // Get page title
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.title
      });

      const title = result[0]?.result || 'Unknown';
      addRecentAction(`Test: Read "${title.slice(0, 30)}..."`);
    }
  } catch (error) {
    addRecentAction(`Test failed: ${error.message}`);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test';
  }
}

// Load saved recent actions
async function loadRecentActions() {
  try {
    const data = await chrome.storage.local.get('recentActions');
    if (data.recentActions) {
      recentActions = data.recentActions;
      renderRecentActions();
    }
  } catch (error) {
    console.error('Failed to load recent actions:', error);
  }
}

// Event listeners
reconnectBtn.addEventListener('click', reconnect);
testBtn.addEventListener('click', testConnection);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  loadRecentActions();

  // Poll status every 2 seconds
  setInterval(checkStatus, 2000);
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'statusUpdate') {
    updateStatus(message.connected);
  } else if (message.type === 'actionPerformed') {
    addRecentAction(message.action);
  }
});
