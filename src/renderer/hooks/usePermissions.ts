import { useState, useEffect, useCallback } from 'react';
import type { Permission } from '@shared/types';

const API_URL = 'http://localhost:3001';

export function usePermissions(sessionId?: string) {
  const [pendingPermission, setPendingPermission] = useState<Permission | null>(null);

  // Poll for pending permissions
  useEffect(() => {
    if (!sessionId) return;

    const checkPermissions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/pending-permissions?sessionId=${sessionId}`);
        const data = await response.json();

        if (data.pending && data.pending.length > 0) {
          setPendingPermission(data.pending[0]);
        }
      } catch {
        // Silently ignore - server might not be running
      }
    };

    const interval = setInterval(checkPermissions, 1000);
    checkPermissions();

    return () => clearInterval(interval);
  }, [sessionId]);

  const approvePermission = useCallback(async (permissionId: string) => {
    try {
      await fetch(`${API_URL}/api/confirm-permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId }),
      });
      setPendingPermission(null);
    } catch (error) {
      console.error('Failed to approve permission:', error);
    }
  }, []);

  const denyPermission = useCallback(async (permissionId: string) => {
    try {
      await fetch(`${API_URL}/api/deny-permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId }),
      });
      setPendingPermission(null);
    } catch (error) {
      console.error('Failed to deny permission:', error);
    }
  }, []);

  return {
    pendingPermission,
    approvePermission,
    denyPermission,
  };
}

export default usePermissions;
