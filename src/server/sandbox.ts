/**
 * Enhanced Sandboxing System
 * Provides fine-grained access control for file and system operations
 */

import path from 'path';
import fs from 'fs/promises';
import type { Permission, SandboxConfig } from '@shared/types';

const SANDBOX_CONFIG_PATH = path.join(process.cwd(), '.nimbus', 'sandbox.json');

// Default sensitive paths that require approval
const DEFAULT_SENSITIVE_PATHS = [
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
  '.gnupg',
  '.npmrc',
  '.netrc',
  'Program Files',
  'Program Files (x86)',
  'Windows',
  'System32',
  '/etc',
  '/var',
  '/usr',
  '/root',
  '/home',
];

// Paths that are always blocked
const ALWAYS_BLOCKED_PATHS = [
  'System32',
  'Windows\\System32',
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.gnupg/private-keys',
];

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.sh',
  '.bash',
  '.zsh',
];

export class Sandbox {
  private config: SandboxConfig;
  private pendingPermissions: Map<string, Permission> = new Map();
  private approvedPaths: Map<string, Set<string>> = new Map(); // sessionId -> approved paths
  private deniedPaths: Map<string, Set<string>> = new Map(); // sessionId -> denied paths
  private auditLog: AuditEntry[] = [];

  constructor() {
    this.config = {
      allowedPaths: [],
      deniedPaths: ALWAYS_BLOCKED_PATHS,
      requireApproval: true,
      sensitivePaths: DEFAULT_SENSITIVE_PATHS,
    };
  }

  /**
   * Initialize sandbox configuration
   */
  async initialize(): Promise<void> {
    try {
      const configDir = path.dirname(SANDBOX_CONFIG_PATH);
      await fs.mkdir(configDir, { recursive: true });

      try {
        const content = await fs.readFile(SANDBOX_CONFIG_PATH, 'utf-8');
        const userConfig = JSON.parse(content) as Partial<SandboxConfig>;
        this.config = { ...this.config, ...userConfig };
      } catch {
        // Config doesn't exist, save default
        await this.saveConfig();
      }

      console.log('[Sandbox] Initialized with config:', {
        sensitivePaths: this.config.sensitivePaths.length,
        deniedPaths: this.config.deniedPaths.length,
        requireApproval: this.config.requireApproval,
      });
    } catch (error) {
      console.error('[Sandbox] Failed to initialize:', error);
    }
  }

  /**
   * Save configuration to disk
   */
  private async saveConfig(): Promise<void> {
    await fs.writeFile(SANDBOX_CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  /**
   * Check if a path is always blocked
   */
  isBlocked(targetPath: string): boolean {
    const normalizedPath = this.normalizePath(targetPath);

    for (const blocked of this.config.deniedPaths) {
      if (normalizedPath.includes(this.normalizePath(blocked))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path is sensitive and requires permission
   */
  isSensitive(targetPath: string): boolean {
    const normalizedPath = this.normalizePath(targetPath);
    const userHome = process.env.USERPROFILE || process.env.HOME || '';

    for (const sensitive of this.config.sensitivePaths) {
      const sensitiveNormalized = this.normalizePath(sensitive);
      const fullSensitivePath = this.normalizePath(path.join(userHome, sensitive));

      if (
        normalizedPath.includes(sensitiveNormalized) ||
        normalizedPath.includes(fullSensitivePath)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path has been approved for a session
   */
  isApproved(sessionId: string, targetPath: string): boolean {
    const approved = this.approvedPaths.get(sessionId);
    if (!approved) return false;

    const normalizedPath = this.normalizePath(targetPath);

    for (const approvedPath of approved) {
      if (normalizedPath.startsWith(approvedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path has been denied for a session
   */
  isDenied(sessionId: string, targetPath: string): boolean {
    const denied = this.deniedPaths.get(sessionId);
    if (!denied) return false;

    const normalizedPath = this.normalizePath(targetPath);

    for (const deniedPath of denied) {
      if (normalizedPath.startsWith(deniedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file extension is dangerous
   */
  isDangerousExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return DANGEROUS_EXTENSIONS.includes(ext);
  }

  /**
   * Validate an operation before execution
   */
  async validateOperation(params: {
    sessionId: string;
    operation: Permission['operation'];
    path: string;
    reason?: string;
  }): Promise<ValidationResult> {
    const { sessionId, operation, path: targetPath, reason } = params;
    const normalizedPath = this.normalizePath(targetPath);

    // Log the operation attempt
    this.logAudit({
      sessionId,
      operation,
      path: targetPath,
      timestamp: new Date(),
      action: 'attempt',
    });

    // Check if always blocked
    if (this.isBlocked(targetPath)) {
      this.logAudit({
        sessionId,
        operation,
        path: targetPath,
        timestamp: new Date(),
        action: 'blocked',
        reason: 'Path is in blocked list',
      });

      return {
        allowed: false,
        reason: 'This path is blocked for security reasons',
        blocked: true,
      };
    }

    // Check if previously denied in this session
    if (this.isDenied(sessionId, targetPath)) {
      return {
        allowed: false,
        reason: 'Access was previously denied',
        blocked: false,
      };
    }

    // Check if already approved
    if (this.isApproved(sessionId, targetPath)) {
      this.logAudit({
        sessionId,
        operation,
        path: targetPath,
        timestamp: new Date(),
        action: 'allowed',
        reason: 'Previously approved',
      });

      return { allowed: true };
    }

    // Check if sensitive and requires approval
    if (this.config.requireApproval && this.isSensitive(targetPath)) {
      const permission = await this.requestPermission({
        sessionId,
        operation,
        path: targetPath,
        reason: reason || `${operation} operation on sensitive path`,
      });

      return {
        allowed: false,
        requiresPermission: true,
        permission,
      };
    }

    // Check dangerous extensions for write operations
    if (
      (operation === 'write' || operation === 'execute') &&
      this.isDangerousExtension(targetPath)
    ) {
      const permission = await this.requestPermission({
        sessionId,
        operation,
        path: targetPath,
        reason: `Creating/executing file with potentially dangerous extension`,
      });

      return {
        allowed: false,
        requiresPermission: true,
        permission,
      };
    }

    // Default: allow
    this.logAudit({
      sessionId,
      operation,
      path: targetPath,
      timestamp: new Date(),
      action: 'allowed',
    });

    return { allowed: true };
  }

  /**
   * Request permission for an operation
   */
  private async requestPermission(params: {
    sessionId: string;
    operation: Permission['operation'];
    path: string;
    reason: string;
  }): Promise<Permission> {
    const permission: Permission = {
      id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...params,
      status: 'pending',
      requestedAt: new Date(),
    };

    this.pendingPermissions.set(permission.id, permission);

    this.logAudit({
      sessionId: params.sessionId,
      operation: params.operation,
      path: params.path,
      timestamp: new Date(),
      action: 'permission_requested',
      permissionId: permission.id,
    });

    return permission;
  }

  /**
   * Approve a pending permission
   */
  approvePermission(permissionId: string): Permission | null {
    const permission = this.pendingPermissions.get(permissionId);
    if (!permission) return null;

    permission.status = 'approved';
    this.pendingPermissions.delete(permissionId);

    const sessionId = permission.sessionId || 'default';

    // Add to approved paths for this session
    if (!this.approvedPaths.has(sessionId)) {
      this.approvedPaths.set(sessionId, new Set());
    }
    this.approvedPaths.get(sessionId)!.add(this.normalizePath(permission.path));

    this.logAudit({
      sessionId,
      operation: permission.operation as Permission['operation'],
      path: permission.path,
      timestamp: new Date(),
      action: 'approved',
      permissionId,
    });

    return permission;
  }

  /**
   * Deny a pending permission
   */
  denyPermission(permissionId: string): Permission | null {
    const permission = this.pendingPermissions.get(permissionId);
    if (!permission) return null;

    permission.status = 'denied';
    this.pendingPermissions.delete(permissionId);

    const sessionId = permission.sessionId || 'default';

    // Add to denied paths for this session
    if (!this.deniedPaths.has(sessionId)) {
      this.deniedPaths.set(sessionId, new Set());
    }
    this.deniedPaths.get(sessionId)!.add(this.normalizePath(permission.path));

    this.logAudit({
      sessionId,
      operation: permission.operation as Permission['operation'],
      path: permission.path,
      timestamp: new Date(),
      action: 'denied',
      permissionId,
    });

    return permission;
  }

  /**
   * Get pending permissions for a session
   */
  getPendingPermissions(sessionId?: string): Permission[] {
    const permissions: Permission[] = [];

    this.pendingPermissions.forEach((perm) => {
      if (!sessionId || perm.sessionId === sessionId) {
        permissions.push(perm);
      }
    });

    return permissions;
  }

  /**
   * Add a path to the allowed list permanently
   */
  async addAllowedPath(pathPattern: string): Promise<void> {
    if (!this.config.allowedPaths.includes(pathPattern)) {
      this.config.allowedPaths.push(pathPattern);
      await this.saveConfig();
    }
  }

  /**
   * Add a path to the denied list permanently
   */
  async addDeniedPath(pathPattern: string): Promise<void> {
    if (!this.config.deniedPaths.includes(pathPattern)) {
      this.config.deniedPaths.push(pathPattern);
      await this.saveConfig();
    }
  }

  /**
   * Clear session permissions
   */
  clearSession(sessionId: string): void {
    this.approvedPaths.delete(sessionId);
    this.deniedPaths.delete(sessionId);

    // Remove pending permissions for this session
    this.pendingPermissions.forEach((perm, id) => {
      if (perm.sessionId === sessionId) {
        this.pendingPermissions.delete(id);
      }
    });
  }

  /**
   * Get audit log
   */
  getAuditLog(limit: number = 100): AuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Log audit entry
   */
  private logAudit(entry: AuditEntry): void {
    this.auditLog.push(entry);

    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Normalize path for comparison
   */
  private normalizePath(targetPath: string): string {
    return path.normalize(targetPath).toLowerCase().replace(/\\/g, '/');
  }

  /**
   * Get current config
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  async updateConfig(updates: Partial<SandboxConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }
}

// Types

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  blocked?: boolean;
  requiresPermission?: boolean;
  permission?: Permission;
}

interface AuditEntry {
  sessionId: string;
  operation: Permission['operation'];
  path: string;
  timestamp: Date;
  action: 'attempt' | 'allowed' | 'blocked' | 'denied' | 'approved' | 'permission_requested';
  reason?: string;
  permissionId?: string;
}

// Singleton instance
export const sandbox = new Sandbox();

export default Sandbox;
