/**
 * Tool Executor Module - Full Autonomous Agent Capabilities
 * Implements local tool execution for agentic AI
 * Works with both Claude and Gemini models
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

// In-memory todo storage per session
const todoStorage = new Map();

// Pending deletions requiring user approval
const pendingDeletions = new Map();

// Pending permissions for sensitive path access
const pendingPermissions = new Map();
const approvedPaths = new Map(); // sessionId -> Set of approved paths

// Progress tracking for visibility
const progressTracker = new Map();

// Sensitive paths that require permission
const SENSITIVE_PATHS = [
  'Downloads',
  'Documents',
  'Desktop',
  'Pictures',
  'Videos',
  'Music',
  'AppData',
  'Application Data',
  '.ssh',
  '.aws',
  '.config',
  'Program Files',
  'Windows',
  'System32'
];

/**
 * Check if a path is sensitive and requires permission
 */
function isSensitivePath(targetPath) {
  const normalizedPath = path.normalize(targetPath).toLowerCase();
  const userHome = process.env.USERPROFILE || process.env.HOME || '';

  return SENSITIVE_PATHS.some(sensitive => {
    const sensitivePattern = sensitive.toLowerCase();
    return normalizedPath.includes(sensitivePattern) ||
           normalizedPath.includes(path.join(userHome, sensitive).toLowerCase());
  });
}

/**
 * Check if path has been approved for this session
 */
function isPathApproved(sessionId, targetPath) {
  const approved = approvedPaths.get(sessionId);
  if (!approved) return false;

  const normalizedPath = path.normalize(targetPath).toLowerCase();
  return Array.from(approved).some(approvedPath =>
    normalizedPath.startsWith(approvedPath.toLowerCase())
  );
}

/**
 * Request permission for sensitive path access
 */
function requestPathPermission(targetPath, operation, reason = '') {
  const permissionId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  pendingPermissions.set(permissionId, {
    path: targetPath,
    operation,
    reason,
    sessionId: currentSessionId,
    requestedAt: new Date().toISOString()
  });

  return {
    requires_permission: true,
    permission_id: permissionId,
    path: targetPath,
    operation,
    message: `Permission required to ${operation} in sensitive location: ${targetPath}`,
    reason,
    instruction: 'User must approve this action. Use ConfirmPermission tool with this permission_id after user approval.'
  };
}

export function getPendingPermissions(sessionId) {
  const permissions = [];
  pendingPermissions.forEach((perm, id) => {
    if (!sessionId || perm.sessionId === sessionId) {
      permissions.push({ id, ...perm });
    }
  });
  return permissions;
}

export function confirmPermission(permissionId) {
  const perm = pendingPermissions.get(permissionId);
  if (!perm) return { error: 'Permission request not found or expired' };

  // Add to approved paths for this session
  if (!approvedPaths.has(perm.sessionId)) {
    approvedPaths.set(perm.sessionId, new Set());
  }
  approvedPaths.get(perm.sessionId).add(path.normalize(perm.path));

  pendingPermissions.delete(permissionId);
  return { approved: true, path: perm.path };
}

export function denyPermission(permissionId) {
  const perm = pendingPermissions.get(permissionId);
  if (!perm) return { error: 'Permission request not found' };
  pendingPermissions.delete(permissionId);
  return { denied: true, path: perm.path };
}

// Browser extension reference (set by server when connected)
let browserExtension = null;

export function setBrowserExtension(ext) {
  browserExtension = ext;
  console.log(`[Tools] Browser extension ${ext ? 'connected' : 'disconnected'}`);
}

// Tool definitions for the API
export const TOOL_DEFINITIONS = [
  // === FILE OPERATIONS ===
  {
    name: 'Read',
    description: 'Read the contents of a file at the specified path. Use this to examine existing files before editing.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from (optional)' },
        limit: { type: 'number', description: 'Number of lines to read (optional)' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'Write',
    description: 'Write content to a file. Creates the file and directories if they do not exist.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to write' },
        content: { type: 'string', description: 'The content to write to the file' }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'Edit',
    description: 'Edit a file by replacing specific text. Always read the file first to ensure accuracy.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to edit' },
        old_string: { type: 'string', description: 'The exact text to find and replace' },
        new_string: { type: 'string', description: 'The text to replace with' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'Glob',
    description: 'Find files matching a glob pattern. Returns list of matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.js", "src/**/*.ts")' },
        path: { type: 'string', description: 'Directory to search in (default: current directory)' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'Grep',
    description: 'Search for text patterns in files using regex. Returns matching lines.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        include: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.js")' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'ListDir',
    description: 'List contents of a directory with file types.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' }
      },
      required: ['path']
    }
  },
  {
    name: 'MakeDir',
    description: 'Create a directory including parent directories.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' }
      },
      required: ['path']
    }
  },
  {
    name: 'Move',
    description: 'Move or rename a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'Copy',
    description: 'Copy a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'Delete',
    description: 'Request to delete a file or directory. Returns a deletion_id that requires user approval before execution.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to delete' },
        recursive: { type: 'boolean', description: 'Delete recursively for directories' },
        reason: { type: 'string', description: 'Reason for deletion (shown to user)' }
      },
      required: ['path']
    }
  },
  {
    name: 'ConfirmDelete',
    description: 'Confirm a pending deletion after user approval. Use the deletion_id from the Delete tool response.',
    input_schema: {
      type: 'object',
      properties: {
        deletion_id: { type: 'string', description: 'The deletion ID from the Delete tool response' }
      },
      required: ['deletion_id']
    }
  },
  {
    name: 'CancelDelete',
    description: 'Cancel a pending deletion request.',
    input_schema: {
      type: 'object',
      properties: {
        deletion_id: { type: 'string', description: 'The deletion ID to cancel' }
      },
      required: ['deletion_id']
    }
  },
  {
    name: 'ConfirmPermission',
    description: 'Confirm permission for sensitive path access after user approval.',
    input_schema: {
      type: 'object',
      properties: {
        permission_id: { type: 'string', description: 'The permission ID from the permission request' }
      },
      required: ['permission_id']
    }
  },
  {
    name: 'DenyPermission',
    description: 'Deny permission for sensitive path access.',
    input_schema: {
      type: 'object',
      properties: {
        permission_id: { type: 'string', description: 'The permission ID to deny' }
      },
      required: ['permission_id']
    }
  },
  {
    name: 'Progress',
    description: 'Report progress on current task to keep user informed.',
    input_schema: {
      type: 'object',
      properties: {
        step: { type: 'string', description: 'Current step being performed' },
        details: { type: 'string', description: 'Details about what is happening' },
        percent: { type: 'number', description: 'Progress percentage (0-100)' }
      },
      required: ['step']
    }
  },

  // === SYSTEM OPERATIONS ===
  {
    name: 'Bash',
    description: 'Execute a shell command. Use for git, npm, system operations, running scripts, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 120000)' },
        cwd: { type: 'string', description: 'Working directory for the command' }
      },
      required: ['command']
    }
  },

  // === WEB OPERATIONS ===
  {
    name: 'WebSearch',
    description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results (default: 5, max: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'WebFetch',
    description: 'Fetch content from a URL. Returns the page content as text or markdown.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        extract_text: { type: 'boolean', description: 'Extract text only, removing HTML (default: true)' }
      },
      required: ['url']
    }
  },

  // === TASK MANAGEMENT ===
  {
    name: 'TodoWrite',
    description: 'Create and manage a task list to track progress. Update task status as you work.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Task description' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Task status' }
            },
            required: ['content', 'status']
          }
        }
      },
      required: ['todos']
    }
  },
  {
    name: 'TodoRead',
    description: 'Read the current task list.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },

  // === ANALYSIS ===
  {
    name: 'CodeAnalysis',
    description: 'Analyze code files to understand structure, dependencies, and patterns.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to analyze' },
        type: { type: 'string', enum: ['structure', 'dependencies', 'summary'], description: 'Type of analysis' }
      },
      required: ['path']
    }
  },

  // === COMPUTER USE (Browser Automation) ===
  {
    name: 'Screenshot',
    description: 'Take a screenshot of the current screen or a specific window. Returns base64 image.',
    input_schema: {
      type: 'object',
      properties: {
        window: { type: 'string', description: 'Window title to capture (optional, captures entire screen if not specified)' }
      }
    }
  },
  {
    name: 'MouseClick',
    description: 'Click at specific screen coordinates.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate (0-1000 scaled)' },
        y: { type: 'number', description: 'Y coordinate (0-1000 scaled)' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
        double_click: { type: 'boolean', description: 'Double click (default: false)' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'TypeText',
    description: 'Type text at the current cursor position.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        delay: { type: 'number', description: 'Delay between keystrokes in ms (default: 50)' }
      },
      required: ['text']
    }
  },
  {
    name: 'KeyPress',
    description: 'Press a key combination (e.g., "Control+C", "Enter", "Alt+Tab").',
    input_schema: {
      type: 'object',
      properties: {
        keys: { type: 'string', description: 'Key combination (e.g., "Control+C", "Enter", "Alt+F4")' }
      },
      required: ['keys']
    }
  },
  {
    name: 'OpenBrowser',
    description: 'Open a web browser and navigate to a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        browser: { type: 'string', enum: ['chrome', 'firefox', 'edge'], description: 'Browser to use (default: chrome)' }
      },
      required: ['url']
    }
  },
  {
    name: 'Scroll',
    description: 'Scroll the screen or a specific element.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll amount in pixels (default: 500)' },
        x: { type: 'number', description: 'X coordinate to scroll at (optional)' },
        y: { type: 'number', description: 'Y coordinate to scroll at (optional)' }
      },
      required: ['direction']
    }
  },
  {
    name: 'Wait',
    description: 'Wait for a specified duration.',
    input_schema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Seconds to wait (default: 1, max: 30)' }
      }
    }
  },

  // === BROWSER EXTENSION TOOLS (when extension is connected) ===
  {
    name: 'BrowserNavigate',
    description: 'Navigate the browser to a URL. Requires Chrome extension to be connected.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        newTab: { type: 'boolean', description: 'Open in new tab (default: false)' }
      },
      required: ['url']
    }
  },
  {
    name: 'BrowserClick',
    description: 'Click an element in the browser by selector or text. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to click' },
        text: { type: 'string', description: 'Text content to find and click' },
        x: { type: 'number', description: 'X coordinate to click' },
        y: { type: 'number', description: 'Y coordinate to click' }
      }
    }
  },
  {
    name: 'BrowserType',
    description: 'Type text into a browser input field. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of input element' },
        text: { type: 'string', description: 'Text to type' },
        clear: { type: 'boolean', description: 'Clear field before typing (default: false)' }
      },
      required: ['text']
    }
  },
  {
    name: 'BrowserRead',
    description: 'Read content from the current browser page. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to read (default: body)' },
        format: { type: 'string', enum: ['text', 'html', 'markdown'], description: 'Output format (default: text)' }
      }
    }
  },
  {
    name: 'BrowserScreenshot',
    description: 'Take a screenshot of the current browser tab. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture full page (default: false, captures visible area)' }
      }
    }
  },
  {
    name: 'BrowserScroll',
    description: 'Scroll the browser page. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll amount in pixels (default: 500)' },
        selector: { type: 'string', description: 'Element selector to scroll (optional)' }
      },
      required: ['direction']
    }
  },
  {
    name: 'BrowserGetTabs',
    description: 'Get list of open browser tabs. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'BrowserSwitchTab',
    description: 'Switch to a specific browser tab by ID. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to switch to' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'BrowserFillForm',
    description: 'Fill multiple form fields at once. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: 'Object mapping CSS selectors to values'
        }
      },
      required: ['fields']
    }
  },
  {
    name: 'BrowserGetElements',
    description: 'Get information about elements matching a selector. Requires Chrome extension.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to find elements' },
        limit: { type: 'number', description: 'Max elements to return (default: 10)' }
      },
      required: ['selector']
    }
  }
];

// Session context for tools that need it
let currentSessionId = 'default';

export function setSessionId(sessionId) {
  currentSessionId = sessionId;
}

/**
 * Execute a tool by name with given input
 */
export async function executeTool(name, input) {
  const startTime = Date.now();
  console.log(`[Tools] Executing ${name}`);

  try {
    let result;
    switch (name) {
      case 'Read': result = await executeRead(input); break;
      case 'Write': result = await executeWrite(input); break;
      case 'Edit': result = await executeEdit(input); break;
      case 'Bash': result = await executeBash(input); break;
      case 'Glob': result = await executeGlob(input); break;
      case 'Grep': result = await executeGrep(input); break;
      case 'ListDir': result = await executeListDir(input); break;
      case 'MakeDir': result = await executeMakeDir(input); break;
      case 'Move': result = await executeMove(input); break;
      case 'Copy': result = await executeCopy(input); break;
      case 'Delete': result = await executeDelete(input); break;
      case 'ConfirmDelete': result = await executeConfirmDelete(input); break;
      case 'CancelDelete': result = await executeCancelDelete(input); break;
      case 'ConfirmPermission': result = confirmPermission(input.permission_id); break;
      case 'DenyPermission': result = denyPermission(input.permission_id); break;
      case 'Progress': result = await executeProgress(input); break;
      case 'WebSearch': result = await executeWebSearch(input); break;
      case 'WebFetch': result = await executeWebFetch(input); break;
      case 'TodoWrite': result = await executeTodoWrite(input); break;
      case 'TodoRead': result = await executeTodoRead(input); break;
      case 'CodeAnalysis': result = await executeCodeAnalysis(input); break;
      // Computer Use tools
      case 'Screenshot': result = await executeScreenshot(input); break;
      case 'MouseClick': result = await executeMouseClick(input); break;
      case 'TypeText': result = await executeTypeText(input); break;
      case 'KeyPress': result = await executeKeyPress(input); break;
      case 'OpenBrowser': result = await executeOpenBrowser(input); break;
      case 'Scroll': result = await executeScroll(input); break;
      case 'Wait': result = await executeWait(input); break;
      // Browser Extension tools
      case 'BrowserNavigate': result = await executeBrowserNavigate(input); break;
      case 'BrowserClick': result = await executeBrowserClick(input); break;
      case 'BrowserType': result = await executeBrowserType(input); break;
      case 'BrowserRead': result = await executeBrowserRead(input); break;
      case 'BrowserScreenshot': result = await executeBrowserScreenshot(input); break;
      case 'BrowserScroll': result = await executeBrowserScroll(input); break;
      case 'BrowserGetTabs': result = await executeBrowserGetTabs(input); break;
      case 'BrowserSwitchTab': result = await executeBrowserSwitchTab(input); break;
      case 'BrowserFillForm': result = await executeBrowserFillForm(input); break;
      case 'BrowserGetElements': result = await executeBrowserGetElements(input); break;
      default: result = { error: `Unknown tool: ${name}` };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Tools] ${name} completed in ${elapsed}ms`);
    return result;
  } catch (error) {
    console.error(`[Tools] Error in ${name}:`, error.message);
    return { error: error.message };
  }
}

// ==================== FILE TOOLS ====================

async function executeRead(input) {
  const { file_path, offset = 0, limit } = input;

  // Check if path is sensitive and requires permission
  if (isSensitivePath(file_path) && !isPathApproved(currentSessionId, file_path)) {
    return requestPathPermission(file_path, 'read', 'Reading files from this location');
  }

  const content = await fs.readFile(file_path, 'utf-8');
  const lines = content.split('\n');

  let result = lines;
  if (offset > 0) result = result.slice(offset - 1);
  if (limit) result = result.slice(0, limit);

  const startLine = offset || 1;
  const numbered = result.map((line, i) => `${String(startLine + i).padStart(5)}│ ${line}`).join('\n');

  return { content: numbered, total_lines: lines.length };
}

async function executeWrite(input) {
  const { file_path, content } = input;

  // Check if path is sensitive and requires permission
  if (isSensitivePath(file_path) && !isPathApproved(currentSessionId, file_path)) {
    return requestPathPermission(file_path, 'write', 'Writing files to this location');
  }

  await fs.mkdir(path.dirname(file_path), { recursive: true });
  await fs.writeFile(file_path, content, 'utf-8');
  return { success: true, path: file_path, bytes: content.length };
}

async function executeEdit(input) {
  const { file_path, old_string, new_string, replace_all = false } = input;

  // Check if path is sensitive and requires permission
  if (isSensitivePath(file_path) && !isPathApproved(currentSessionId, file_path)) {
    return requestPathPermission(file_path, 'edit', 'Editing files in this location');
  }

  const content = await fs.readFile(file_path, 'utf-8');

  if (!content.includes(old_string)) {
    return { error: `String not found: "${old_string.slice(0, 100)}..."` };
  }

  const newContent = replace_all
    ? content.split(old_string).join(new_string)
    : content.replace(old_string, new_string);

  await fs.writeFile(file_path, newContent, 'utf-8');
  return { success: true, path: file_path };
}

async function executeGlob(input) {
  const { pattern, path: searchPath = process.cwd() } = input;
  const matches = await glob(pattern, { cwd: searchPath, absolute: true });
  return { files: matches.slice(0, 200), count: matches.length };
}

async function executeGrep(input) {
  const { pattern, path: searchPath = process.cwd(), include } = input;
  const regex = new RegExp(pattern, 'gi');
  const results = [];

  let files;
  if (include) {
    files = await glob(include, { cwd: searchPath, absolute: true });
  } else {
    const stat = await fs.stat(searchPath);
    files = stat.isFile() ? [searchPath] : await glob('**/*', { cwd: searchPath, absolute: true, nodir: true });
  }

  for (const file of files.slice(0, 50)) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      content.split('\n').forEach((line, i) => {
        if (regex.test(line)) {
          results.push({ file, line: i + 1, content: line.slice(0, 300) });
        }
      });
      if (results.length > 100) break;
    } catch { /* skip binary files */ }
  }

  return { matches: results, count: results.length };
}

async function executeListDir(input) {
  const { path: dirPath } = input;

  // Check if path is sensitive and requires permission
  if (isSensitivePath(dirPath) && !isPathApproved(currentSessionId, dirPath)) {
    return requestPathPermission(dirPath, 'list', 'Listing files in this location');
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const items = await Promise.all(entries.map(async e => {
    const fullPath = path.join(dirPath, e.name);
    let size = null;
    try {
      if (!e.isDirectory()) {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      }
    } catch {}
    return {
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
      size
    };
  }));
  return { items, count: items.length };
}

async function executeMakeDir(input) {
  // Check if path is sensitive and requires permission
  if (isSensitivePath(input.path) && !isPathApproved(currentSessionId, input.path)) {
    return requestPathPermission(input.path, 'create directory', 'Creating directory in this location');
  }

  await fs.mkdir(input.path, { recursive: true });
  return { success: true, path: input.path };
}

async function executeMove(input) {
  // Check if either source or destination is sensitive
  if (isSensitivePath(input.source) && !isPathApproved(currentSessionId, input.source)) {
    return requestPathPermission(input.source, 'move from', 'Moving files from this location');
  }
  if (isSensitivePath(input.destination) && !isPathApproved(currentSessionId, input.destination)) {
    return requestPathPermission(input.destination, 'move to', 'Moving files to this location');
  }

  await fs.rename(input.source, input.destination);
  return { success: true, source: input.source, destination: input.destination };
}

async function executeCopy(input) {
  const { source, destination } = input;

  // Check if either source or destination is sensitive
  if (isSensitivePath(source) && !isPathApproved(currentSessionId, source)) {
    return requestPathPermission(source, 'copy from', 'Copying files from this location');
  }
  if (isSensitivePath(destination) && !isPathApproved(currentSessionId, destination)) {
    return requestPathPermission(destination, 'copy to', 'Copying files to this location');
  }

  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.cp(source, destination, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  return { success: true, source, destination };
}

// Delete now requires confirmation - creates a pending deletion
async function executeDelete(input) {
  const { path: targetPath, recursive = false, reason = 'No reason provided' } = input;

  // Check if path exists
  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch {
    return { error: `Path not found: ${targetPath}` };
  }

  // Generate unique deletion ID
  const deletionId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Calculate size for directories
  let size = 0;
  let fileCount = 1;
  if (stat.isDirectory()) {
    const files = await glob('**/*', { cwd: targetPath, nodir: true });
    fileCount = files.length;
    size = stat.size; // Approximate
  } else {
    size = stat.size;
  }

  // Store pending deletion
  pendingDeletions.set(deletionId, {
    path: targetPath,
    recursive,
    reason,
    isDirectory: stat.isDirectory(),
    size,
    fileCount,
    createdAt: new Date().toISOString(),
    session: currentSessionId
  });

  return {
    requires_approval: true,
    deletion_id: deletionId,
    path: targetPath,
    type: stat.isDirectory() ? 'directory' : 'file',
    file_count: fileCount,
    reason,
    message: `Deletion request created. User must approve deletion of ${targetPath}. Use ConfirmDelete with deletion_id="${deletionId}" after user approval.`
  };
}

// Confirm a pending deletion after user approval
async function executeConfirmDelete(input) {
  const { deletion_id } = input;

  const pending = pendingDeletions.get(deletion_id);
  if (!pending) {
    return { error: `No pending deletion found with id: ${deletion_id}. It may have expired or already been processed.` };
  }

  const { path: targetPath, recursive, isDirectory } = pending;

  try {
    if (isDirectory) {
      await fs.rm(targetPath, { recursive });
    } else {
      await fs.unlink(targetPath);
    }

    pendingDeletions.delete(deletion_id);
    return {
      success: true,
      path: targetPath,
      message: `Successfully deleted ${targetPath}`
    };
  } catch (error) {
    return { error: `Failed to delete: ${error.message}` };
  }
}

// Cancel a pending deletion
async function executeCancelDelete(input) {
  const { deletion_id } = input;

  const pending = pendingDeletions.get(deletion_id);
  if (!pending) {
    return { error: `No pending deletion found with id: ${deletion_id}` };
  }

  pendingDeletions.delete(deletion_id);
  return {
    success: true,
    cancelled: true,
    path: pending.path,
    message: `Deletion of ${pending.path} has been cancelled.`
  };
}

// Progress reporting for user visibility
async function executeProgress(input) {
  const { step, details = '', percent } = input;

  const progressEntry = {
    step,
    details,
    percent: percent || null,
    timestamp: new Date().toISOString()
  };

  // Store progress for session
  if (!progressTracker.has(currentSessionId)) {
    progressTracker.set(currentSessionId, []);
  }
  progressTracker.get(currentSessionId).push(progressEntry);

  // Keep last 50 entries per session
  const entries = progressTracker.get(currentSessionId);
  if (entries.length > 50) {
    entries.splice(0, entries.length - 50);
  }

  console.log(`[Progress] ${step}${percent ? ` (${percent}%)` : ''}: ${details}`);

  return {
    reported: true,
    step,
    details,
    percent,
    message: `Progress: ${step}`
  };
}

// Export pending deletions for UI
export function getPendingDeletions(sessionId) {
  const pending = [];
  for (const [id, data] of pendingDeletions.entries()) {
    if (!sessionId || data.session === sessionId) {
      pending.push({ id, ...data });
    }
  }
  return pending;
}

// Export progress for UI
export function getProgress(sessionId) {
  return progressTracker.get(sessionId) || [];
}

// ==================== SYSTEM TOOLS ====================

async function executeBash(input) {
  const { command, timeout = 120000, cwd } = input;

  // Security checks
  const dangerous = ['rm -rf /', 'mkfs', ':(){', 'format c:'];
  if (dangerous.some(d => command.toLowerCase().includes(d))) {
    return { error: 'Blocked: dangerous command pattern detected' };
  }

  try {
    const options = {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      cwd: cwd || process.cwd()
    };

    const { stdout, stderr } = await execAsync(command, options);
    return {
      stdout: stdout.slice(0, 30000),
      stderr: stderr.slice(0, 5000),
      success: true
    };
  } catch (error) {
    return {
      stdout: error.stdout?.slice(0, 30000) || '',
      stderr: error.stderr?.slice(0, 5000) || error.message,
      exit_code: error.code,
      success: false
    };
  }
}

// ==================== WEB TOOLS ====================

async function executeWebSearch(input) {
  const { query, num_results = 5 } = input;

  // Use DuckDuckGo HTML search (no API key needed)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchUrl(searchUrl);

    // Parse results from HTML
    const results = [];
    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < num_results) {
      results.push({
        url: match[1],
        title: match[2].replace(/<[^>]+>/g, '').trim(),
        snippet: match[3].replace(/<[^>]+>/g, '').trim()
      });
    }

    // Fallback: simpler parsing
    if (results.length === 0) {
      const linkRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      while ((match = linkRegex.exec(html)) !== null && results.length < num_results) {
        results.push({
          url: match[1],
          title: match[2].trim(),
          snippet: ''
        });
      }
    }

    return { results, count: results.length, query };
  } catch (error) {
    return { error: `Search failed: ${error.message}`, query };
  }
}

async function executeWebFetch(input) {
  const { url, extract_text = true } = input;

  try {
    const html = await fetchUrl(url);

    if (extract_text) {
      // Extract text content
      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Limit size
      text = text.slice(0, 15000);
      return { content: text, url, type: 'text' };
    }

    return { content: html.slice(0, 30000), url, type: 'html' };
  } catch (error) {
    return { error: `Fetch failed: ${error.message}`, url };
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ==================== TASK TOOLS ====================

async function executeTodoWrite(input) {
  const { todos } = input;
  todoStorage.set(currentSessionId, todos);

  const summary = {
    pending: todos.filter(t => t.status === 'pending').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
    total: todos.length
  };

  return { success: true, summary, todos };
}

async function executeTodoRead() {
  const todos = todoStorage.get(currentSessionId) || [];
  return { todos, count: todos.length };
}

// ==================== ANALYSIS TOOLS ====================

async function executeCodeAnalysis(input) {
  const { path: targetPath, type = 'structure' } = input;

  const stat = await fs.stat(targetPath);

  if (type === 'structure') {
    if (stat.isFile()) {
      const content = await fs.readFile(targetPath, 'utf-8');
      const lines = content.split('\n');

      // Extract functions/classes
      const functions = [];
      const classes = [];
      const imports = [];

      lines.forEach((line, i) => {
        if (/^(export\s+)?(async\s+)?function\s+(\w+)/.test(line)) {
          functions.push({ name: line.match(/function\s+(\w+)/)?.[1], line: i + 1 });
        }
        if (/^(export\s+)?class\s+(\w+)/.test(line)) {
          classes.push({ name: line.match(/class\s+(\w+)/)?.[1], line: i + 1 });
        }
        if (/^import\s+/.test(line)) {
          imports.push(line.trim());
        }
      });

      return { file: targetPath, lines: lines.length, functions, classes, imports };
    } else {
      // Directory structure
      const files = await glob('**/*', { cwd: targetPath, nodir: true });
      const byType = {};

      files.forEach(f => {
        const ext = path.extname(f) || 'no-extension';
        byType[ext] = (byType[ext] || 0) + 1;
      });

      return { directory: targetPath, totalFiles: files.length, byExtension: byType };
    }
  }

  if (type === 'dependencies') {
    // Look for package.json
    const pkgPath = stat.isFile() ? path.dirname(targetPath) : targetPath;
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(pkgPath, 'package.json'), 'utf-8'));
      return {
        name: pkg.name,
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {})
      };
    } catch {
      return { error: 'No package.json found' };
    }
  }

  return { error: `Unknown analysis type: ${type}` };
}

// ==================== COMPUTER USE TOOLS ====================

// Check if NirCmd is available (much faster than PowerShell)
let nircmdAvailable = null;
async function checkNircmd() {
  if (nircmdAvailable !== null) return nircmdAvailable;
  try {
    await execAsync('nircmd --help', { timeout: 2000 });
    nircmdAvailable = true;
    console.log('[Tools] NirCmd detected - using fast mouse/keyboard');
  } catch {
    nircmdAvailable = false;
    console.log('[Tools] NirCmd not found - using PowerShell (slower)');
  }
  return nircmdAvailable;
}

// Screenshot - uses nircmd (fast) or PowerShell (slow) on Windows
async function executeScreenshot(input) {
  const screenshotPath = path.join(process.cwd(), `screenshot_${Date.now()}.png`);

  try {
    if (process.platform === 'win32') {
      const hasNircmd = await checkNircmd();

      if (hasNircmd) {
        // NirCmd is MUCH faster (~50ms vs ~2000ms)
        await execAsync(`nircmd savescreenshot "${screenshotPath}"`, { timeout: 5000 });
      } else {
        // Fallback to PowerShell
        const scriptPath = path.join(process.cwd(), 'screenshot_script.ps1');
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
$bitmap.Save('${screenshotPath.replace(/\\/g, '\\\\')}')
$graphics.Dispose()
$bitmap.Dispose()
`;
        await fs.writeFile(scriptPath, psScript);
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 30000 });
        await fs.unlink(scriptPath);
      }
    } else if (process.platform === 'darwin') {
      await execAsync(`screencapture -x "${screenshotPath}"`);
    } else {
      await execAsync(`scrot "${screenshotPath}"`);
    }

    // Read and return as base64
    const imageBuffer = await fs.readFile(screenshotPath);
    const base64 = imageBuffer.toString('base64');
    await fs.unlink(screenshotPath);

    return {
      success: true,
      image: `data:image/png;base64,${base64}`,
      path: screenshotPath,
      message: 'Screenshot captured successfully'
    };
  } catch (error) {
    return { error: `Screenshot failed: ${error.message}` };
  }
}

// Mouse click - uses nircmd (fast) or PowerShell (slow)
async function executeMouseClick(input) {
  const { x, y, button = 'left', double_click = false } = input;

  // Scale from 0-1000 to actual screen coordinates (1920x1080)
  const screenX = Math.round((x / 1000) * 1920);
  const screenY = Math.round((y / 1000) * 1080);

  try {
    if (process.platform === 'win32') {
      const hasNircmd = await checkNircmd();

      if (hasNircmd) {
        // NirCmd is MUCH faster (~20ms vs ~1500ms)
        await execAsync(`nircmd setcursor ${screenX} ${screenY}`, { timeout: 2000 });
        const clickCmd = button === 'right' ? 'sendmouse right click' : 'sendmouse left click';
        await execAsync(`nircmd ${clickCmd}`, { timeout: 2000 });
        if (double_click) {
          await execAsync(`nircmd ${clickCmd}`, { timeout: 2000 });
        }
      } else {
        // Fallback to PowerShell
        const scriptPath = path.join(process.cwd(), 'mouse_script.ps1');
        const leftDown = 0x0002, leftUp = 0x0004;
        const rightDown = 0x0008, rightUp = 0x0010;
        const downFlag = button === 'right' ? rightDown : leftDown;
        const upFlag = button === 'right' ? rightUp : leftUp;

        const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[MouseOps]::SetCursorPos(${screenX}, ${screenY})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event(${downFlag}, 0, 0, 0, 0)
[MouseOps]::mouse_event(${upFlag}, 0, 0, 0, 0)
${double_click ? `Start-Sleep -Milliseconds 100
[MouseOps]::mouse_event(${downFlag}, 0, 0, 0, 0)
[MouseOps]::mouse_event(${upFlag}, 0, 0, 0, 0)` : ''}
`;
        await fs.writeFile(scriptPath, psScript);
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 10000 });
        await fs.unlink(scriptPath);
      }
    } else {
      const clickCmd = double_click ? 'click --repeat 2' : 'click';
      const buttonNum = button === 'right' ? '3' : button === 'middle' ? '2' : '1';
      await execAsync(`xdotool mousemove ${screenX} ${screenY} ${clickCmd} ${buttonNum}`);
    }

    return {
      success: true,
      x: screenX,
      y: screenY,
      button,
      double_click,
      message: `Clicked at (${screenX}, ${screenY})`
    };
  } catch (error) {
    return { error: `Mouse click failed: ${error.message}` };
  }
}

// Type text - uses nircmd (fast) or PowerShell (slow)
async function executeTypeText(input) {
  const { text, delay = 0 } = input;

  try {
    if (process.platform === 'win32') {
      const hasNircmd = await checkNircmd();

      if (hasNircmd) {
        // NirCmd sendkeypress for each character (still faster than PowerShell)
        // For longer text, use clipboard method
        if (text.length > 10) {
          // Use clipboard for longer text (much faster)
          const scriptPath = path.join(process.cwd(), 'type_clip.ps1');
          const psScript = `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`;
          await fs.writeFile(scriptPath, psScript);
          await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 5000 });
          await fs.unlink(scriptPath);
          await execAsync('nircmd sendkeypress ctrl+v', { timeout: 2000 });
        } else {
          // Type character by character for short text
          for (const char of text) {
            if (char === '\n') {
              await execAsync('nircmd sendkeypress enter', { timeout: 1000 });
            } else if (char === ' ') {
              await execAsync('nircmd sendkeypress space', { timeout: 1000 });
            } else if (char === '\t') {
              await execAsync('nircmd sendkeypress tab', { timeout: 1000 });
            } else {
              await execAsync(`nircmd sendkeypress ${char}`, { timeout: 1000 });
            }
          }
        }
      } else {
        // Fallback to PowerShell SendKeys
        const scriptPath = path.join(process.cwd(), 'type_script.ps1');
        const escapedText = text
          .replace(/\+/g, '{+}')
          .replace(/\^/g, '{^}')
          .replace(/%/g, '{%}')
          .replace(/~/g, '{~}')
          .replace(/\(/g, '{(}')
          .replace(/\)/g, '{)}')
          .replace(/\[/g, '{[}')
          .replace(/\]/g, '{]}')
          .replace(/\{/g, '{{}')
          .replace(/\}/g, '{}}')
          .replace(/\n/g, '{ENTER}');

        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapedText.replace(/'/g, "''")}')
`;
        await fs.writeFile(scriptPath, psScript);
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 30000 });
        await fs.unlink(scriptPath);
      }
    } else {
      await execAsync(`xdotool type --delay ${delay} "${text.replace(/"/g, '\\"')}"`);
    }

    return {
      success: true,
      text: text.slice(0, 50),
      message: `Typed: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`
    };
  } catch (error) {
    return { error: `Type text failed: ${error.message}` };
  }
}

// Press key combination - uses nircmd (fast) or PowerShell (slow)
async function executeKeyPress(input) {
  const { keys } = input;

  try {
    if (process.platform === 'win32') {
      const hasNircmd = await checkNircmd();

      if (hasNircmd) {
        // NirCmd format: sendkeypress ctrl+c, sendkeypress alt+f4, etc.
        const nircmdKeys = keys.toLowerCase().replace(/control/g, 'ctrl');
        await execAsync(`nircmd sendkeypress ${nircmdKeys}`, { timeout: 2000 });
      } else {
        // Fallback to PowerShell
        const scriptPath = path.join(process.cwd(), 'keypress_script.ps1');

        const keyMap = {
          'Control': '^', 'Ctrl': '^',
          'Alt': '%',
          'Shift': '+',
          'Enter': '{ENTER}',
          'Tab': '{TAB}',
          'Escape': '{ESC}', 'Esc': '{ESC}',
          'Backspace': '{BACKSPACE}',
          'Delete': '{DELETE}', 'Del': '{DELETE}',
          'Home': '{HOME}',
          'End': '{END}',
          'PageUp': '{PGUP}',
          'PageDown': '{PGDN}',
          'Up': '{UP}', 'Down': '{DOWN}',
          'Left': '{LEFT}', 'Right': '{RIGHT}',
          'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
          'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
          'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
          'Space': ' '
        };

        const parts = keys.split('+').map(k => k.trim());
        let sendKeysStr = '';

        for (const part of parts) {
          if (keyMap[part]) {
            sendKeysStr += keyMap[part];
          } else {
            sendKeysStr += part.toLowerCase();
          }
        }

        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr}')
`;
        await fs.writeFile(scriptPath, psScript);
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 10000 });
        await fs.unlink(scriptPath);
      }
    } else {
      const xdoKeys = keys.split('+').map(k => k.trim().toLowerCase()).join('+');
      await execAsync(`xdotool key ${xdoKeys}`);
    }

    return {
      success: true,
      keys,
      message: `Pressed: ${keys}`
    };
  } catch (error) {
    return { error: `Key press failed: ${error.message}` };
  }
}

// Open browser and navigate to URL
async function executeOpenBrowser(input) {
  const { url, browser = 'default' } = input;

  try {
    if (process.platform === 'win32') {
      // Use start command which is faster
      await execAsync(`start "" "${url}"`, { shell: 'cmd.exe', timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }

    return {
      success: true,
      url,
      message: `Opened ${url}`
    };
  } catch (error) {
    return { error: `Open browser failed: ${error.message}` };
  }
}

// Scroll the screen
async function executeScroll(input) {
  const { direction, amount = 3 } = input;

  try {
    if (process.platform === 'win32') {
      const scriptPath = path.join(process.cwd(), 'scroll_script.ps1');
      // Scroll wheel: positive = up, negative = down
      const wheelDelta = (direction === 'up' ? 120 : -120) * amount;

      const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ScrollOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, int dwExtraInfo);
}
"@
[ScrollOps]::mouse_event(0x0800, 0, 0, ${wheelDelta}, 0)
`;
      await fs.writeFile(scriptPath, psScript);
      await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 10000 });
      await fs.unlink(scriptPath);
    } else {
      const scrollBtn = direction === 'up' ? '4' : '5';
      await execAsync(`xdotool click --repeat ${amount} ${scrollBtn}`);
    }

    return {
      success: true,
      direction,
      amount,
      message: `Scrolled ${direction}`
    };
  } catch (error) {
    return { error: `Scroll failed: ${error.message}` };
  }
}

// Wait for a duration
async function executeWait(input) {
  const { seconds = 1 } = input;
  const waitTime = Math.min(Math.max(seconds, 0.1), 30) * 1000;

  await new Promise(resolve => setTimeout(resolve, waitTime));

  return {
    success: true,
    waited: seconds,
    message: `Waited ${seconds} seconds`
  };
}

// ==================== BROWSER EXTENSION TOOLS ====================

// Helper to check if browser extension is connected
function checkBrowserExtension() {
  if (!browserExtension || !browserExtension.isConnected()) {
    return { error: 'Browser extension not connected. Please install and connect the Chrome extension.' };
  }
  return null;
}

async function executeBrowserNavigate(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  const { url, newTab = false } = input;
  return await browserExtension.sendCommand('navigate', { url, newTab });
}

async function executeBrowserClick(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('click', input);
}

async function executeBrowserType(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('type', input);
}

async function executeBrowserRead(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('read', input);
}

async function executeBrowserScreenshot(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('screenshot', input);
}

async function executeBrowserScroll(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('scroll', input);
}

async function executeBrowserGetTabs(_input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('getTabs', {});
}

async function executeBrowserSwitchTab(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('switchTab', input);
}

async function executeBrowserFillForm(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('fillForm', input);
}

async function executeBrowserGetElements(input) {
  const check = checkBrowserExtension();
  if (check) return check;

  return await browserExtension.sendCommand('getElements', input);
}

export default { TOOL_DEFINITIONS, executeTool, setSessionId, getPendingDeletions, getProgress, setBrowserExtension };
