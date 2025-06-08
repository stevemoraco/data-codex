import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Standardized LLM Log Entry Format
 * Designed for both human readability and LLM consumption
 */
export interface LLMLogEntry {
  /** ISO timestamp when this entry was created */
  timestamp: string;
  /** Unique identifier for this log entry */
  id: string;
  /** Agent/model that generated this entry */
  agent: {
    id: string;
    model: string;
    provider: string;
    branch?: string;
  };
  /** Type of entry for categorization */
  type: 'input' | 'output' | 'error' | 'task' | 'coordination' | 'decision' | 'summary' | 'context_compression';
  /** Current working task or context */
  task?: {
    id: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked';
  };
  /** The actual content/data */
  content: {
    /** Human-readable summary of this entry */
    summary: string;
    /** Full content/payload */
    data: any;
    /** Token count for cost tracking */
    tokens?: {
      input: number;
      output: number;
      total: number;
    };
  };
  /** Related files or context */
  context?: {
    files?: string[];
    command?: string;
    workdir?: string;
    gitBranch?: string;
  };
  /** Links to related log entries */
  related?: string[];
  /** Tags for filtering/searching */
  tags?: string[];
}

/**
 * LLM Logs Manager - Creates standardized logs for all agent activity
 */
export class LLMLogsManager {
  private logsDir: string;
  private projectRoot: string;
  private sessionId: string;
  
  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, 'LLM_LOGS');
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 
                     '-' + Date.now().toString().slice(-6);
  }

  /**
   * Initialize the LLM logs directory structure
   */
  async initialize(): Promise<void> {
    const dirs = [
      this.logsDir,
      path.join(this.logsDir, 'sessions'),
      path.join(this.logsDir, 'agents'),
      path.join(this.logsDir, 'tasks'),
      path.join(this.logsDir, 'coordination'),
      path.join(this.logsDir, 'summaries'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create README for the logs directory
    await this.createLogsReadme();
    
    // Create session log
    await this.createSessionLog();
  }

  /**
   * Log an entry from an agent
   */
  async logEntry(entry: Omit<LLMLogEntry, 'timestamp' | 'id'>): Promise<string> {
    const logEntry: LLMLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      id: this.generateLogId(),
    };

    // Write to multiple locations for easy access
    await Promise.all([
      this.writeSessionLog(logEntry),
      this.writeAgentLog(logEntry),
      this.writeTaskLog(logEntry),
      this.writeTypeLog(logEntry),
    ]);

    return logEntry.id;
  }

  /**
   * Log agent input (user prompt, task assignment)
   */
  async logInput(agentInfo: LLMLogEntry['agent'], content: any, context?: LLMLogEntry['context']): Promise<string> {
    return this.logEntry({
      agent: agentInfo,
      type: 'input',
      content: {
        summary: `Input received: ${this.summarizeContent(content)}`,
        data: content,
      },
      context,
      tags: ['input', agentInfo.model, agentInfo.provider],
    });
  }

  /**
   * Log agent output (response, code generation, etc.)
   */
  async logOutput(agentInfo: LLMLogEntry['agent'], content: any, tokens?: LLMLogEntry['content']['tokens'], context?: LLMLogEntry['context']): Promise<string> {
    return this.logEntry({
      agent: agentInfo,
      type: 'output',
      content: {
        summary: `Output generated: ${this.summarizeContent(content)}`,
        data: content,
        tokens,
      },
      context,
      tags: ['output', agentInfo.model, agentInfo.provider],
    });
  }

  /**
   * Log task coordination between agents
   */
  async logCoordination(fromAgent: LLMLogEntry['agent'], toAgent: LLMLogEntry['agent'], message: string, data?: any): Promise<string> {
    return this.logEntry({
      agent: fromAgent,
      type: 'coordination',
      content: {
        summary: `Coordination: ${fromAgent.model} → ${toAgent.model}: ${message}`,
        data: {
          message,
          toAgent,
          payload: data,
        },
      },
      tags: ['coordination', fromAgent.model, toAgent.model],
    });
  }

  /**
   * Log task creation, updates, completion
   */
  async logTask(agentInfo: LLMLogEntry['agent'], task: LLMLogEntry['task'], action: string): Promise<string> {
    return this.logEntry({
      agent: agentInfo,
      type: 'task',
      task,
      content: {
        summary: `Task ${action}: ${task?.description}`,
        data: { action, task },
      },
      tags: ['task', action, task?.priority || 'unknown'],
    });
  }

  /**
   * Log errors and failures
   */
  async logError(agentInfo: LLMLogEntry['agent'], error: Error | string, context?: LLMLogEntry['context']): Promise<string> {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : { message: error };

    return this.logEntry({
      agent: agentInfo,
      type: 'error',
      content: {
        summary: `Error: ${errorData.message}`,
        data: errorData,
      },
      context,
      tags: ['error', agentInfo.model, 'failure'],
    });
  }

  /**
   * Generate periodic summaries for agents to review
   */
  async generateSummary(timeRange: 'last-hour' | 'last-day' | 'session'): Promise<void> {
    const summaryPath = path.join(this.logsDir, 'summaries', `summary-${timeRange}-${Date.now()}.md`);
    
    const logs = await this.getLogsInTimeRange(timeRange);
    const summary = this.createMarkdownSummary(logs, timeRange);
    
    await fs.writeFile(summaryPath, summary);
  }

  /**
   * Get logs for a specific agent
   */
  async getAgentLogs(agentId: string): Promise<LLMLogEntry[]> {
    const agentLogPath = path.join(this.logsDir, 'agents', `${agentId}.jsonl`);
    
    if (!existsSync(agentLogPath)) return [];
    
    const content = await fs.readFile(agentLogPath, 'utf-8');
    return content.trim().split('\n').map(line => JSON.parse(line));
  }

  /**
   * Search logs by content, tags, or agent
   */
  async searchLogs(query: {
    agent?: string;
    type?: LLMLogEntry['type'];
    tags?: string[];
    timeRange?: { start: Date; end: Date };
    content?: string;
  }): Promise<LLMLogEntry[]> {
    // Read from markdown files instead of JSONL
    const sessionLogPath = path.join(this.logsDir, 'sessions', `${this.sessionId}.md`);
    
    if (!existsSync(sessionLogPath)) return [];
    
    // For now, return empty array since we switched to markdown
    // In a production system, you'd parse the markdown to extract log entries
    return [];
  }

  private generateLogId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private summarizeContent(content: any): string {
    if (typeof content === 'string') {
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }
    
    if (typeof content === 'object') {
      if (content.type === 'message' && content.content) {
        const text = content.content.map((c: any) => c.text || '').join(' ');
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
      }
      return JSON.stringify(content).substring(0, 100) + '...';
    }
    
    return String(content).substring(0, 100);
  }

  private async writeSessionLog(entry: LLMLogEntry): Promise<void> {
    const sessionLogPath = path.join(this.logsDir, 'sessions', `${this.sessionId}.md`);
    const markdownEntry = this.formatAsMarkdown(entry);
    await fs.appendFile(sessionLogPath, '\n\n---\n\n' + markdownEntry);
  }

  private async writeAgentLog(entry: LLMLogEntry): Promise<void> {
    const agentLogPath = path.join(this.logsDir, 'agents', `${entry.agent.id}.md`);
    const markdownEntry = this.formatAsMarkdown(entry);
    await fs.appendFile(agentLogPath, '\n\n---\n\n' + markdownEntry);
  }

  private async writeTaskLog(entry: LLMLogEntry): Promise<void> {
    if (!entry.task) return;
    
    const taskLogPath = path.join(this.logsDir, 'tasks', `${entry.task.id}.md`);
    const markdownEntry = this.formatAsMarkdown(entry);
    await fs.appendFile(taskLogPath, '\n\n---\n\n' + markdownEntry);
  }

  private async writeTypeLog(entry: LLMLogEntry): Promise<void> {
    const typeLogPath = path.join(this.logsDir, 'coordination', `${entry.type}.md`);
    const markdownEntry = this.formatAsMarkdown(entry);
    await fs.appendFile(typeLogPath, '\n\n---\n\n' + markdownEntry);
  }

  private async createLogsReadme(): Promise<void> {
    const readmePath = path.join(this.logsDir, 'README.md');
    const readme = `# LLM Logs Directory

This directory contains standardized logs from all AI agent activity in this project.

## Directory Structure

- \`sessions/\` - Logs organized by session (chronological)
- \`agents/\` - Logs organized by individual agent/model
- \`tasks/\` - Logs organized by task ID
- \`coordination/\` - Logs organized by type (input, output, coordination, etc.)
- \`summaries/\` - Generated summaries for quick review

## Log Format

Each log entry follows a standardized JSON format:

\`\`\`json
{
  "timestamp": "ISO datetime",
  "id": "unique-log-id", 
  "agent": {
    "id": "agent-id",
    "model": "model-name",
    "provider": "openai|anthropic|google",
    "branch": "git-branch-name"
  },
  "type": "input|output|error|task|coordination|decision|summary",
  "task": {
    "id": "task-id",
    "description": "what the agent is working on",
    "priority": "low|medium|high|critical",
    "status": "pending|in-progress|completed|failed|blocked"
  },
  "content": {
    "summary": "human-readable summary",
    "data": "full content/payload",
    "tokens": { "input": 123, "output": 456, "total": 579 }
  },
  "context": {
    "files": ["modified files"],
    "command": "shell command run",
    "workdir": "working directory",
    "gitBranch": "current git branch"
  },
  "related": ["related-log-ids"],
  "tags": ["searchable", "tags"]
}
\`\`\`

## Usage for Agents

Agents can grep and search these logs to understand:
- What other agents are working on
- Recent decisions and context
- Task progress and coordination
- Error patterns and solutions

## Usage for Developers

- Monitor agent behavior and coordination
- Debug multi-agent interactions
- Track token usage and costs
- Review task completion and failures
- Understand agent decision-making processes

Generated by Codex CLI - AI Agent Coordination System
`;

    await fs.writeFile(readmePath, readme);
  }

  private async createSessionLog(): Promise<void> {
    const sessionPath = path.join(this.logsDir, 'sessions', `${this.sessionId}.md`);
    const sessionInfo = `# Session ${this.sessionId}

**Started:** ${new Date().toISOString()}
**Project:** ${this.projectRoot}
**PID:** ${process.pid}

## Session Overview

This session log tracks all agent activity and coordination for this Codex CLI session.

### Quick Navigation
- [Agent Logs](../agents/)
- [Task Logs](../tasks/) 
- [Coordination Logs](../coordination/)
- [Session Data](${this.sessionId}.jsonl)

---

*This file is auto-generated. See README.md for log format details.*
`;

    await fs.writeFile(sessionPath, sessionInfo);
  }

  private async getLogsInTimeRange(timeRange: 'last-hour' | 'last-day' | 'session'): Promise<LLMLogEntry[]> {
    // Since we switched to markdown, return empty for now
    return [];
  }

  private createMarkdownSummary(logs: LLMLogEntry[], timeRange: string): string {
    const agentStats = new Map<string, { inputs: number; outputs: number; errors: number; tasks: number }>();
    const taskStats = new Map<string, { status: string; agent: string; description: string }>();
    
    logs.forEach(log => {
      const agentKey = `${log.agent.model}@${log.agent.provider}`;
      const stats = agentStats.get(agentKey) || { inputs: 0, outputs: 0, errors: 0, tasks: 0 };
      
      if (log.type === 'input') stats.inputs++;
      if (log.type === 'output') stats.outputs++;
      if (log.type === 'error') stats.errors++;
      if (log.type === 'task') stats.tasks++;
      
      agentStats.set(agentKey, stats);
      
      if (log.task) {
        taskStats.set(log.task.id, {
          status: log.task.status,
          agent: agentKey,
          description: log.task.description,
        });
      }
    });

    let summary = `# Agent Activity Summary - ${timeRange}\n\n`;
    summary += `**Generated:** ${new Date().toISOString()}\n`;
    summary += `**Total Log Entries:** ${logs.length}\n\n`;
    
    summary += `## Agent Statistics\n\n`;
    for (const [agent, stats] of agentStats) {
      summary += `### ${agent}\n`;
      summary += `- Inputs: ${stats.inputs}\n`;
      summary += `- Outputs: ${stats.outputs}\n`;
      summary += `- Tasks: ${stats.tasks}\n`;
      summary += `- Errors: ${stats.errors}\n\n`;
    }
    
    summary += `## Task Overview\n\n`;
    for (const [taskId, task] of taskStats) {
      summary += `- **${taskId}** (${task.status}) - ${task.description} [${task.agent}]\n`;
    }
    
    summary += `\n## Recent Activity\n\n`;
    logs.slice(-10).forEach(log => {
      summary += `- ${log.timestamp}: [${log.agent.model}] ${log.content.summary}\n`;
    });
    
    return summary;
  }

  /**
   * Log context compression events
   */
  async logContextCompression(
    agent: LLMLogEntry['agent'],
    compressionInfo: {
      beforeTokens: number;
      afterTokens: number;
      compressionRatio: number;
      method: string;
      reason: string;
    },
    context?: LLMLogEntry['context']
  ): Promise<void> {
    const entry: LLMLogEntry = {
      timestamp: new Date().toISOString(),
      id: this.generateLogId(),
      agent,
      type: 'context_compression',
      content: {
        summary: `Context compressed: ${compressionInfo.beforeTokens} → ${compressionInfo.afterTokens} tokens (${compressionInfo.compressionRatio.toFixed(1)}x)`,
        data: compressionInfo,
        tokens: {
          input: compressionInfo.beforeTokens,
          output: compressionInfo.afterTokens,
          total: compressionInfo.beforeTokens
        }
      },
      context,
      tags: ['context-management', 'compression', 'optimization']
    };

    await this.writeLogEntry(entry);
  }

  /**
   * Write a log entry to all appropriate locations in Markdown format
   */
  private async writeLogEntry(entry: LLMLogEntry): Promise<void> {
    try {
      // Write to main session log (Markdown format for human readability)
      const sessionLogPath = path.join(this.logsDir, 'sessions', `${this.sessionId}.md`);
      const markdownEntry = this.formatAsMarkdown(entry);
      await fs.appendFile(sessionLogPath, markdownEntry + '\n\n---\n\n');

      // Write to agent-specific log (Markdown format for readability)
      const agentLogPath = path.join(this.logsDir, 'agents', `${entry.agent.id}.md`);
      await fs.appendFile(agentLogPath, markdownEntry + '\n\n---\n\n');

      // Write to type-specific logs for easy filtering
      const typeLogPath = path.join(this.logsDir, entry.type, `${new Date().toISOString().split('T')[0]}.md`);
      await fs.appendFile(typeLogPath, markdownEntry + '\n\n---\n\n');

      // Write coordination messages to coordination log
      if (entry.type === 'coordination') {
        const coordLogPath = path.join(this.logsDir, 'coordination', `${new Date().toISOString().split('T')[0]}.md`);
        await fs.appendFile(coordLogPath, markdownEntry + '\n\n---\n\n');
      }

      // Write task-related logs
      if (entry.task) {
        const taskLogPath = path.join(this.logsDir, 'tasks', `${entry.task.id}.md`);
        await fs.appendFile(taskLogPath, markdownEntry + '\n\n---\n\n');
      }

      // All logs are now in markdown format for human and AI readability

    } catch (error) {
      console.error('Failed to write log entry:', error);
    }
  }

  /**
   * Format a log entry as human-readable Markdown
   */
  private formatAsMarkdown(entry: LLMLogEntry): string {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const typeEmoji = this.getTypeEmoji(entry.type);
    
    let markdown = `## ${typeEmoji} ${entry.type.toUpperCase()} - ${timestamp}\n\n`;
    
    // Agent info
    markdown += `**Agent:** ${entry.agent.model} (${entry.agent.provider})\n`;
    if (entry.agent.branch) {
      markdown += `**Branch:** \`${entry.agent.branch}\`\n`;
    }
    markdown += `**ID:** \`${entry.id}\`\n\n`;
    
    // Task info if present
    if (entry.task) {
      markdown += `### 📋 Task Information\n`;
      markdown += `- **Task ID:** \`${entry.task.id}\`\n`;
      markdown += `- **Description:** ${entry.task.description}\n`;
      markdown += `- **Priority:** ${entry.task.priority.toUpperCase()}\n`;
      markdown += `- **Status:** ${entry.task.status}\n\n`;
    }
    
    // Main content
    markdown += `### 💬 Summary\n${entry.content.summary}\n\n`;
    
    // Detailed data if present
    if (entry.content.data && typeof entry.content.data === 'object') {
      markdown += `### 📊 Details\n`;
      if (entry.type === 'context_compression') {
        const data = entry.content.data as any;
        markdown += `- **Before:** ${data.beforeTokens?.toLocaleString()} tokens\n`;
        markdown += `- **After:** ${data.afterTokens?.toLocaleString()} tokens\n`;
        markdown += `- **Compression Ratio:** ${data.compressionRatio}x\n`;
        markdown += `- **Method:** ${data.method}\n`;
        markdown += `- **Reason:** ${data.reason}\n\n`;
      } else {
        markdown += `\`\`\`json\n${JSON.stringify(entry.content.data, null, 2)}\n\`\`\`\n\n`;
      }
    }
    
    // Token usage if present
    if (entry.content.tokens) {
      markdown += `### 🏷️ Token Usage\n`;
      markdown += `- **Input:** ${entry.content.tokens.input?.toLocaleString()} tokens\n`;
      markdown += `- **Output:** ${entry.content.tokens.output?.toLocaleString()} tokens\n`;
      markdown += `- **Total:** ${entry.content.tokens.total?.toLocaleString()} tokens\n\n`;
    }
    
    // Context info
    if (entry.context) {
      markdown += `### 🌍 Context\n`;
      if (entry.context.workdir) markdown += `- **Working Directory:** \`${entry.context.workdir}\`\n`;
      if (entry.context.gitBranch) markdown += `- **Git Branch:** \`${entry.context.gitBranch}\`\n`;
      if (entry.context.command) markdown += `- **Command:** \`${entry.context.command}\`\n`;
      if (entry.context.files) markdown += `- **Files:** ${entry.context.files.join(', ')}\n`;
      markdown += '\n';
    }
    
    // Tags and related entries
    if (entry.tags && entry.tags.length > 0) {
      markdown += `**Tags:** ${entry.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
    }
    if (entry.related && entry.related.length > 0) {
      markdown += `**Related:** ${entry.related.map(id => `\`${id}\``).join(', ')}\n`;
    }
    
    return markdown;
  }

  /**
   * Get emoji for log entry type
   */
  private getTypeEmoji(type: LLMLogEntry['type']): string {
    const emojis = {
      'input': '📥',
      'output': '📤',
      'error': '❌',
      'task': '📋',
      'coordination': '🤝',
      'decision': '🎯',
      'summary': '📊',
      'context_compression': '🗜️'
    };
    return emojis[type] || '📝';
  }
}

// Global instance for the current project
let globalLogsManager: LLMLogsManager | null = null;

/**
 * Get or create the global LLM logs manager
 */
export function getLLMLogsManager(projectRoot?: string): LLMLogsManager {
  if (!globalLogsManager) {
    globalLogsManager = new LLMLogsManager(projectRoot);
  }
  return globalLogsManager;
}