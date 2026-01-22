/**
 * Skills System - Custom Workflows and Automations
 * Allows users to define reusable skills that can be triggered manually or automatically
 */

import fs from 'fs/promises';
import path from 'path';
import type { Skill, SkillExecution, SkillStep, SkillStepExecution } from '@shared/types';

const SKILLS_DIR = path.join(process.cwd(), '.nimbus', 'skills');

export class SkillsManager {
  private skills: Map<string, Skill> = new Map();
  private executions: Map<string, SkillExecution> = new Map();
  private toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>;

  constructor(toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>) {
    this.toolExecutor = toolExecutor;
  }

  /**
   * Initialize skills from disk
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(SKILLS_DIR, { recursive: true });
      const files = await fs.readdir(SKILLS_DIR);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(SKILLS_DIR, file), 'utf-8');
          const skill = JSON.parse(content) as Skill;
          this.skills.set(skill.id, skill);
        }
      }

      console.log(`[Skills] Loaded ${this.skills.size} skills`);
    } catch (error) {
      console.warn('[Skills] Failed to load skills:', error);
    }
  }

  /**
   * Get all skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skill by ID
   */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Find skills by keyword trigger
   */
  findByKeyword(keyword: string): Skill[] {
    return this.getAll().filter(
      (skill) =>
        skill.enabled &&
        skill.trigger.type === 'keyword' &&
        skill.trigger.value &&
        keyword.toLowerCase().includes(skill.trigger.value.toLowerCase())
    );
  }

  /**
   * Create a new skill
   */
  async create(skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>): Promise<Skill> {
    const newSkill: Skill = {
      ...skill,
      id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.skills.set(newSkill.id, newSkill);
    await this.save(newSkill);

    console.log(`[Skills] Created skill: ${newSkill.name}`);
    return newSkill;
  }

  /**
   * Update a skill
   */
  async update(id: string, updates: Partial<Skill>): Promise<Skill | null> {
    const skill = this.skills.get(id);
    if (!skill) return null;

    const updatedSkill = {
      ...skill,
      ...updates,
      id, // Preserve ID
      updatedAt: new Date(),
    };

    this.skills.set(id, updatedSkill);
    await this.save(updatedSkill);

    return updatedSkill;
  }

  /**
   * Delete a skill
   */
  async delete(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    this.skills.delete(id);
    try {
      await fs.unlink(path.join(SKILLS_DIR, `${id}.json`));
    } catch {
      // File might not exist
    }

    console.log(`[Skills] Deleted skill: ${skill.name}`);
    return true;
  }

  /**
   * Save skill to disk
   */
  private async save(skill: Skill): Promise<void> {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(SKILLS_DIR, `${skill.id}.json`),
      JSON.stringify(skill, null, 2)
    );
  }

  /**
   * Execute a skill
   */
  async execute(skillId: string, context?: Record<string, unknown>): Promise<SkillExecution> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    if (!skill.enabled) {
      throw new Error(`Skill is disabled: ${skill.name}`);
    }

    const execution: SkillExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      skillId,
      status: 'running',
      startedAt: new Date(),
      steps: skill.steps.map((step) => ({
        stepId: step.id,
        status: 'pending',
      })),
    };

    this.executions.set(execution.id, execution);

    console.log(`[Skills] Executing skill: ${skill.name}`);

    try {
      let currentStepIndex = 0;

      while (currentStepIndex < skill.steps.length) {
        const step = skill.steps[currentStepIndex];
        const stepExecution = execution.steps.find((s) => s.stepId === step.id);

        if (!stepExecution) break;

        stepExecution.status = 'running';
        stepExecution.startedAt = new Date();

        try {
          const result = await this.executeStep(step, context);
          stepExecution.status = 'completed';
          stepExecution.result = result;
          stepExecution.completedAt = new Date();

          // Determine next step
          if (step.onSuccess) {
            const nextIndex = skill.steps.findIndex((s) => s.id === step.onSuccess);
            if (nextIndex !== -1) {
              currentStepIndex = nextIndex;
              continue;
            }
          }

          currentStepIndex++;
        } catch (error) {
          stepExecution.status = 'failed';
          stepExecution.error = error instanceof Error ? error.message : 'Unknown error';
          stepExecution.completedAt = new Date();

          // Handle failure
          if (step.onFailure) {
            const nextIndex = skill.steps.findIndex((s) => s.id === step.onFailure);
            if (nextIndex !== -1) {
              currentStepIndex = nextIndex;
              continue;
            }
          }

          // No failure handler, stop execution
          throw error;
        }
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = new Date();
    }

    return execution;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: SkillStep,
    context?: Record<string, unknown>
  ): Promise<unknown> {
    switch (step.type) {
      case 'tool':
        if (!step.tool) {
          throw new Error('Tool step missing tool name');
        }
        const input = this.interpolateContext(step.input || {}, context);
        return await this.toolExecutor(step.tool, input);

      case 'prompt':
        // Return prompt for AI processing
        return {
          type: 'prompt',
          content: this.interpolateContext({ text: step.prompt }, context),
        };

      case 'condition':
        if (!step.condition) {
          throw new Error('Condition step missing condition');
        }
        // Simple condition evaluation
        return this.evaluateCondition(step.condition, context);

      case 'loop':
        // Loop implementation would go here
        return { type: 'loop', completed: true };

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Interpolate context variables into input
   */
  private interpolateContext(
    input: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!context) return input;

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        // Replace {{variable}} with context value
        result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
          return context[varName]?.toString() || '';
        });
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateCondition(condition: string, context?: Record<string, unknown>): boolean {
    // Simple implementation - can be extended
    if (!context) return false;

    // Support basic conditions like "fileExists" or "result.success"
    const parts = condition.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return false;
      }
    }

    return Boolean(value);
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): SkillExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Cancel a running execution
   */
  cancel(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return false;

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    return true;
  }
}

// ==================== Built-in Skills ====================

export const BUILT_IN_SKILLS: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Organize Downloads',
    description: 'Sort files in Downloads folder by type',
    icon: '📁',
    trigger: { type: 'manual' },
    steps: [
      {
        id: 'step1',
        type: 'tool',
        tool: 'ListDir',
        input: { path: '{{downloadsPath}}' },
      },
      {
        id: 'step2',
        type: 'prompt',
        prompt: 'Organize these files by type into subfolders: Images, Documents, Videos, Archives, Other',
      },
    ],
    enabled: true,
  },
  {
    name: 'Daily Backup',
    description: 'Backup important folders to a designated location',
    icon: '💾',
    trigger: { type: 'schedule', schedule: '0 0 * * *' }, // Daily at midnight
    steps: [
      {
        id: 'step1',
        type: 'tool',
        tool: 'Copy',
        input: {
          source: '{{documentsPath}}',
          destination: '{{backupPath}}/{{date}}-documents',
        },
      },
    ],
    enabled: false, // Disabled by default
  },
  {
    name: 'Quick Search',
    description: 'Search the web and summarize results',
    icon: '🔍',
    trigger: { type: 'keyword', value: '/search' },
    steps: [
      {
        id: 'step1',
        type: 'tool',
        tool: 'WebSearch',
        input: { query: '{{query}}' },
      },
      {
        id: 'step2',
        type: 'prompt',
        prompt: 'Summarize the search results in a concise format',
      },
    ],
    enabled: true,
  },
  {
    name: 'Code Review',
    description: 'Analyze code files for issues and improvements',
    icon: '👀',
    trigger: { type: 'keyword', value: '/review' },
    steps: [
      {
        id: 'step1',
        type: 'tool',
        tool: 'Read',
        input: { file_path: '{{filePath}}' },
      },
      {
        id: 'step2',
        type: 'prompt',
        prompt: 'Review this code for: bugs, security issues, performance problems, and style improvements. Provide specific suggestions.',
      },
    ],
    enabled: true,
  },
];

export default SkillsManager;
