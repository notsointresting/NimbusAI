/**
 * Nimbus - Chrome Extension Background Service
 * Handles WebSocket connection to backend and coordinates browser actions
 */

// Configuration
const CONFIG = {
  wsUrl: 'ws://localhost:3001/browser',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10
};

// State
let ws = null;
let reconnectAttempts = 0;
let isConnected = false;

// Connect to backend WebSocket
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log('[Nimbus] Connecting to', CONFIG.wsUrl);

  try {
    ws = new WebSocket(CONFIG.wsUrl);

    ws.onopen = () => {
      console.log('[Nimbus] Connected to backend');
      isConnected = true;
      reconnectAttempts = 0;
      updateBadge('connected');

      // Register with backend
      ws.send(JSON.stringify({
        type: 'register',
        client: 'chrome-extension',
        version: chrome.runtime.getManifest().version
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Nimbus] Received:', message.type);

        const result = await handleCommand(message);

        // Send result back
        ws.send(JSON.stringify({
          type: 'result',
          id: message.id,
          ...result
        }));
      } catch (error) {
        console.error('[Nimbus] Error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          id: event.data?.id,
          error: error.message
        }));
      }
    };

    ws.onclose = () => {
      console.log('[Nimbus] Disconnected');
      isConnected = false;
      updateBadge('disconnected');
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[Nimbus] WebSocket error:', error);
      updateBadge('error');
    };

  } catch (error) {
    console.error('[Nimbus] Connection failed:', error);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectAttempts < CONFIG.maxReconnectAttempts) {
    reconnectAttempts++;
    console.log(`[Nimbus] Reconnecting in ${CONFIG.reconnectInterval}ms (attempt ${reconnectAttempts})`);
    setTimeout(connect, CONFIG.reconnectInterval);
  }
}

function updateBadge(status) {
  const colors = {
    connected: '#22c55e',
    disconnected: '#6b7280',
    error: '#ef4444',
    working: '#3b82f6'
  };

  chrome.action.setBadgeBackgroundColor({ color: colors[status] || colors.disconnected });
  chrome.action.setBadgeText({ text: status === 'connected' ? '✓' : status === 'working' ? '...' : '' });
}

// Handle commands from backend
async function handleCommand(message) {
  const { type, action, params = {} } = message;

  updateBadge('working');

  try {
    switch (action) {
      case 'navigate':
        return await navigateTo(params.url, params.newTab);

      case 'click':
        return await clickElement(params);

      case 'type':
        return await typeText(params);

      case 'read':
        return await readPage(params);

      case 'screenshot':
        return await takeScreenshot(params);

      case 'scroll':
        return await scrollPage(params);

      case 'execute':
        return await executeScript(params);

      case 'getTabs':
        return await getOpenTabs();

      case 'switchTab':
        return await switchToTab(params.tabId);

      case 'fillForm':
        return await fillForm(params);

      case 'getElements':
        return await getElements(params);

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } finally {
    updateBadge('connected');
  }
}

// === Browser Actions ===

async function navigateTo(url, newTab = false) {
  if (newTab) {
    const tab = await chrome.tabs.create({ url });
    return { success: true, tabId: tab.id, url };
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.update(tab.id, { url });
    return { success: true, tabId: tab.id, url };
  }
}

async function clickElement(params) {
  const { selector, text, x, y, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (selector, text, x, y) => {
      let element;

      if (selector) {
        element = document.querySelector(selector);
      } else if (text) {
        // Find element by text content
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.includes(text)) {
            element = walker.currentNode.parentElement;
            break;
          }
        }
      } else if (x !== undefined && y !== undefined) {
        element = document.elementFromPoint(x, y);
      }

      if (element) {
        element.click();
        return { success: true, tagName: element.tagName, text: element.textContent?.slice(0, 100) };
      }
      return { success: false, error: 'Element not found' };
    },
    args: [selector, text, x, y]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function typeText(params) {
  const { selector, text, clear = false, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (selector, text, clear) => {
      const element = selector ? document.querySelector(selector) : document.activeElement;

      if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)) {
        if (clear) {
          element.value = '';
        }

        // Set value directly (fast)
        if (element.value !== undefined) {
          element.value += text;
        } else {
          element.textContent += text;
        }

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true, typed: text.length };
      }
      return { success: false, error: 'No input element found or focused' };
    },
    args: [selector, text, clear]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function readPage(params) {
  const { selector, format = 'text', tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (selector, format) => {
      const element = selector ? document.querySelector(selector) : document.body;

      if (!element) {
        return { success: false, error: 'Element not found' };
      }

      let content;
      switch (format) {
        case 'html':
          content = element.innerHTML;
          break;
        case 'markdown':
          // Simple HTML to Markdown conversion
          content = element.innerHTML
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          break;
        default:
          content = element.innerText || element.textContent;
      }

      return {
        success: true,
        content: content.slice(0, 50000),
        url: window.location.href,
        title: document.title
      };
    },
    args: [selector, format]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function takeScreenshot(params) {
  const { tabId, fullPage = false } = params;
  const targetTabId = tabId || (await getActiveTabId());

  // Capture visible area
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  return {
    success: true,
    image: dataUrl,
    message: 'Screenshot captured'
  };
}

async function scrollPage(params) {
  const { direction = 'down', amount = 500, selector, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (direction, amount, selector) => {
      const element = selector ? document.querySelector(selector) : window;
      const scrollAmount = direction === 'up' ? -amount : amount;

      if (element === window) {
        window.scrollBy(0, scrollAmount);
      } else {
        element.scrollTop += scrollAmount;
      }

      return { success: true, scrolled: scrollAmount };
    },
    args: [direction, amount, selector]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function executeScript(params) {
  const { code, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (code) => {
      try {
        const result = eval(code);
        return { success: true, result: JSON.stringify(result) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    args: [code]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function getOpenTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    success: true,
    tabs: tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active
    }))
  };
}

async function switchToTab(tabId) {
  await chrome.tabs.update(tabId, { active: true });
  return { success: true, tabId };
}

async function fillForm(params) {
  const { fields, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (fields) => {
      const results = [];

      for (const [selector, value] of Object.entries(fields)) {
        const element = document.querySelector(selector);
        if (element) {
          if (element.type === 'checkbox' || element.type === 'radio') {
            element.checked = !!value;
          } else if (element.tagName === 'SELECT') {
            element.value = value;
          } else {
            element.value = value;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          results.push({ selector, success: true });
        } else {
          results.push({ selector, success: false, error: 'Not found' });
        }
      }

      return { success: true, results };
    },
    args: [fields]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

async function getElements(params) {
  const { selector, limit = 10, tabId } = params;
  const targetTabId = tabId || (await getActiveTabId());

  const result = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (selector, limit) => {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, limit);
      return {
        success: true,
        elements: elements.map((el, i) => ({
          index: i,
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          text: el.textContent?.slice(0, 100),
          href: el.href,
          src: el.src,
          value: el.value
        }))
      };
    },
    args: [selector, limit]
  });

  return result[0]?.result || { success: false, error: 'Script execution failed' };
}

// Helper to get active tab ID
async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Nimbus] Installed');
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Nimbus] Started');
  connect();
});

// Also try to connect immediately
connect();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    sendResponse({ connected: isConnected });
  } else if (message.type === 'reconnect') {
    reconnectAttempts = 0;
    connect();
    sendResponse({ reconnecting: true });
  }
  return true;
});
