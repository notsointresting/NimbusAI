import type { Permission } from '@shared/types';
import './PermissionDialog.css';

interface PermissionDialogProps {
  permission: Permission;
  onApprove: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ permission, onApprove, onDeny }: PermissionDialogProps) {
  return (
    <div className="permission-overlay">
      <div className="permission-dialog">
        <div className="permission-header">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" className="permission-icon">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h3>Permission Required</h3>
        </div>

        <div className="permission-content">
          <p className="permission-message">
            Nimbus needs permission to {permission.operation} files in a sensitive location.
          </p>

          <div className="permission-details">
            <div className="permission-row">
              <span className="permission-label">Path:</span>
              <span className="permission-value">{permission.path}</span>
            </div>
            <div className="permission-row">
              <span className="permission-label">Operation:</span>
              <span className="permission-value">{permission.operation}</span>
            </div>
            {permission.reason && (
              <div className="permission-row">
                <span className="permission-label">Reason:</span>
                <span className="permission-value">{permission.reason}</span>
              </div>
            )}
          </div>
        </div>

        <div className="permission-actions">
          <button className="btn btn-secondary" onClick={onDeny}>
            Deny
          </button>
          <button className="btn btn-success" onClick={onApprove}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default PermissionDialog;
