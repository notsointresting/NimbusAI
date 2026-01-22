export function SettingsView() {
  return (
    <div className="settings-view">
      <div className="settings-content">
        <h1>Settings</h1>

        <section className="settings-section">
          <h2>Providers</h2>
          <div className="settings-card">
            <div className="setting-item">
              <div className="setting-info">
                <h3>Antigravity Proxy</h3>
                <p>Free access to Claude and Gemini models</p>
              </div>
              <span className="status-dot connected" />
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <h3>Ollama</h3>
                <p>Run AI models locally on your machine</p>
              </div>
              <span className="status-dot disconnected" />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Security</h2>
          <div className="settings-card">
            <div className="setting-item">
              <div className="setting-info">
                <h3>Require Permission for Sensitive Paths</h3>
                <p>Ask for approval before accessing Downloads, Documents, etc.</p>
              </div>
              <label className="toggle">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <h3>Block System Files</h3>
                <p>Prevent access to system directories</p>
              </div>
              <label className="toggle">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>Browser Automation</h2>
          <div className="settings-card">
            <div className="setting-item">
              <div className="setting-info">
                <h3>Chrome Extension</h3>
                <p>Connect to browser for web automation</p>
              </div>
              <span className="status-dot disconnected" />
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <h3>Playwright (Gemini Computer Use)</h3>
                <p>Native browser automation via Playwright</p>
              </div>
              <button className="btn btn-secondary">Configure</button>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .settings-view {
          flex: 1;
          overflow-y: auto;
          padding: 40px;
        }

        .settings-content {
          max-width: 700px;
          margin: 0 auto;
        }

        .settings-content h1 {
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 32px;
        }

        .settings-section {
          margin-bottom: 32px;
        }

        .settings-section h2 {
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          margin-bottom: 12px;
        }

        .settings-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light);
        }

        .setting-item:last-child {
          border-bottom: none;
        }

        .setting-info h3 {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .setting-info p {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .toggle {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--bg-tertiary);
          border-radius: 24px;
          transition: all 0.2s;
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: all 0.2s;
        }

        .toggle input:checked + .toggle-slider {
          background: var(--success);
        }

        .toggle input:checked + .toggle-slider::before {
          transform: translateX(20px);
        }
      `}</style>
    </div>
  );
}

export default SettingsView;
