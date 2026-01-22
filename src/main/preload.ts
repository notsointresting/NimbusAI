/**
 * Nimbus AI Agent - Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('nimbus', {
  // Platform info
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getVersion: () => ipcRenderer.invoke('get-version'),

  // IPC helpers
  send: (channel: string, data: unknown) => {
    const validChannels = ['settings-update', 'skill-run', 'permission-response'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = ['permission-request', 'skill-result', 'server-status'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    nimbus: {
      getPlatform: () => Promise<string>;
      getVersion: () => Promise<string>;
      send: (channel: string, data: unknown) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
