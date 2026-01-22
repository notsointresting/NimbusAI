/**
 * Nimbus - Content Script
 * Runs in the context of web pages for enhanced DOM interaction
 */

// Highlight element on hover (for visual feedback during automation)
let highlightedElement = null;
let highlightOverlay = null;

// Create highlight overlay element
function createHighlightOverlay() {
  if (highlightOverlay) return;

  highlightOverlay = document.createElement('div');
  highlightOverlay.id = 'cowork-highlight-overlay';
  highlightOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 999999;
    transition: all 0.1s ease;
    display: none;
  `;
  document.body.appendChild(highlightOverlay);
}

// Highlight an element
function highlightElement(element) {
  if (!element) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  createHighlightOverlay();
  const rect = element.getBoundingClientRect();

  highlightOverlay.style.left = rect.left + 'px';
  highlightOverlay.style.top = rect.top + 'px';
  highlightOverlay.style.width = rect.width + 'px';
  highlightOverlay.style.height = rect.height + 'px';
  highlightOverlay.style.display = 'block';
}

// Get element info for debugging
function getElementInfo(element) {
  if (!element) return null;

  return {
    tagName: element.tagName,
    id: element.id,
    className: element.className,
    text: element.textContent?.slice(0, 100),
    href: element.href,
    src: element.src,
    value: element.value,
    type: element.type,
    name: element.name,
    placeholder: element.placeholder,
    rect: element.getBoundingClientRect()
  };
}

// Find interactive elements on the page
function findInteractiveElements() {
  const selectors = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[onclick]',
    '[tabindex]'
  ];

  const elements = document.querySelectorAll(selectors.join(', '));

  return Array.from(elements).map((el, index) => ({
    index,
    ...getElementInfo(el),
    selector: generateUniqueSelector(el)
  })).filter(el => {
    // Filter out hidden elements
    const rect = el.rect;
    return rect && rect.width > 0 && rect.height > 0;
  });
}

// Generate a unique CSS selector for an element
function generateUniqueSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.name) {
    return `[name="${element.name}"]`;
  }

  // Build path from element to unique ancestor
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      path.unshift(`#${current.id}`);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length) {
        selector += '.' + classes.join('.');
      }
    }

    // Add nth-child if needed
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

// Scroll element into view
function scrollIntoViewIfNeeded(element) {
  const rect = element.getBoundingClientRect();
  const isVisible = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );

  if (!isVisible) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Wait for element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Enhanced click with visual feedback
async function enhancedClick(params) {
  const { selector, text, x, y } = params;
  let element;

  if (selector) {
    element = document.querySelector(selector);
  } else if (text) {
    // Find by text content
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

  if (!element) {
    return { success: false, error: 'Element not found' };
  }

  // Visual feedback
  highlightElement(element);
  scrollIntoViewIfNeeded(element);

  // Wait a bit for scroll
  await new Promise(r => setTimeout(r, 100));

  // Simulate realistic click
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  element.click();

  // Hide highlight after click
  setTimeout(() => highlightElement(null), 500);

  return {
    success: true,
    element: getElementInfo(element)
  };
}

// Enhanced type with visual feedback
async function enhancedType(params) {
  const { selector, text, clear = false, pressEnter = false } = params;

  let element = selector ? document.querySelector(selector) : document.activeElement;

  if (!element || !['INPUT', 'TEXTAREA'].includes(element.tagName) && !element.isContentEditable) {
    return { success: false, error: 'No input element found' };
  }

  // Visual feedback
  highlightElement(element);
  scrollIntoViewIfNeeded(element);
  element.focus();

  if (clear) {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Type character by character for more realistic simulation
  if (element.value !== undefined) {
    element.value += text;
  } else {
    element.textContent += text;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  if (pressEnter) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13 }));

    // If it's in a form, submit it
    const form = element.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    }
  }

  setTimeout(() => highlightElement(null), 500);

  return {
    success: true,
    typed: text.length,
    element: getElementInfo(element)
  };
}

// Extract structured data from the page
function extractPageData() {
  return {
    url: window.location.href,
    title: document.title,
    meta: {
      description: document.querySelector('meta[name="description"]')?.content,
      keywords: document.querySelector('meta[name="keywords"]')?.content,
      author: document.querySelector('meta[name="author"]')?.content
    },
    headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      level: h.tagName,
      text: h.textContent.trim()
    })),
    links: Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
      text: a.textContent.trim().slice(0, 100),
      href: a.href
    })),
    images: Array.from(document.querySelectorAll('img')).slice(0, 20).map(img => ({
      alt: img.alt,
      src: img.src
    })),
    forms: Array.from(document.querySelectorAll('form')).map(form => ({
      action: form.action,
      method: form.method,
      inputs: Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder
      }))
    }))
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, params = {} } = message;

  (async () => {
    try {
      let result;

      switch (action) {
        case 'enhancedClick':
          result = await enhancedClick(params);
          break;

        case 'enhancedType':
          result = await enhancedType(params);
          break;

        case 'findElements':
          result = { success: true, elements: findInteractiveElements() };
          break;

        case 'extractData':
          result = { success: true, data: extractPageData() };
          break;

        case 'highlight':
          const el = document.querySelector(params.selector);
          highlightElement(el);
          result = { success: !!el };
          break;

        case 'waitForElement':
          try {
            await waitForElement(params.selector, params.timeout);
            result = { success: true };
          } catch (e) {
            result = { success: false, error: e.message };
          }
          break;

        case 'getElementInfo':
          const element = document.querySelector(params.selector);
          result = element
            ? { success: true, info: getElementInfo(element) }
            : { success: false, error: 'Element not found' };
          break;

        default:
          result = { success: false, error: `Unknown action: ${action}` };
      }

      sendResponse(result);
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
});

// Initialize
console.log('[Nimbus] Content script loaded');
