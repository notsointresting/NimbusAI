import { useState, useEffect } from 'react';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
}

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([
    { id: '1', name: 'Organize Downloads', description: 'Sort files by type', icon: '📁', enabled: true },
    { id: '2', name: 'Quick Search', description: 'Search web and summarize', icon: '🔍', enabled: true },
    { id: '3', name: 'Code Review', description: 'Analyze code for issues', icon: '👀', enabled: true },
    { id: '4', name: 'Daily Backup', description: 'Backup important folders', icon: '💾', enabled: false },
  ]);

  const toggleSkill = (id: string) => {
    setSkills(skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  return (
    <div className="skills-view">
      <div className="skills-content">
        <div className="skills-header">
          <h1>Skills</h1>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Skill
          </button>
        </div>

        <p className="skills-description">
          Skills are reusable workflows that automate common tasks. Enable them to use with triggers or run them manually.
        </p>

        <div className="skills-grid">
          {skills.map((skill) => (
            <div key={skill.id} className={`skill-card ${skill.enabled ? 'enabled' : ''}`}>
              <div className="skill-icon">{skill.icon}</div>
              <div className="skill-info">
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
              </div>
              <div className="skill-actions">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={() => toggleSkill(skill.id)}
                  />
                  <span className="toggle-slider" />
                </label>
                <button className="btn btn-ghost">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" transform="rotate(45 12 12)" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="skills-templates">
          <h2>Templates</h2>
          <p>Start with a template and customize it to your needs.</p>

          <div className="template-grid">
            <button className="template-card">
              <span className="template-icon">📊</span>
              <span className="template-name">Data Analysis</span>
            </button>
            <button className="template-card">
              <span className="template-icon">📝</span>
              <span className="template-name">Document Writer</span>
            </button>
            <button className="template-card">
              <span className="template-icon">🌐</span>
              <span className="template-name">Web Scraper</span>
            </button>
            <button className="template-card">
              <span className="template-icon">🔄</span>
              <span className="template-name">File Sync</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .skills-view {
          flex: 1;
          overflow-y: auto;
          padding: 40px;
        }

        .skills-content {
          max-width: 900px;
          margin: 0 auto;
        }

        .skills-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .skills-header h1 {
          font-size: 28px;
          font-weight: 600;
        }

        .skills-description {
          color: var(--text-secondary);
          margin-bottom: 32px;
        }

        .skills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 48px;
        }

        .skill-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-lg);
          transition: all var(--transition-fast);
        }

        .skill-card.enabled {
          border-color: var(--success);
        }

        .skill-card:hover {
          box-shadow: var(--shadow-md);
        }

        .skill-icon {
          font-size: 32px;
        }

        .skill-info {
          flex: 1;
        }

        .skill-info h3 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .skill-info p {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .skill-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .skills-templates {
          margin-top: 48px;
        }

        .skills-templates h2 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .skills-templates > p {
          color: var(--text-secondary);
          margin-bottom: 20px;
        }

        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }

        .template-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          background: var(--bg-secondary);
          border: 1px dashed var(--border-light);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .template-card:hover {
          border-color: var(--accent-primary);
          border-style: solid;
        }

        .template-icon {
          font-size: 28px;
        }

        .template-name {
          font-size: 13px;
          font-weight: 500;
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

export default SkillsView;
