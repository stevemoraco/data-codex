import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * SUPER SIMPLE LLM Logs - Just Two File Types!
 * 1. LLM_LOGS/agents/{agentId}/tasks.md - Tasks for each agent
 * 2. LLM_LOGS/projectManagement.md - Main coordinator overview
 */

export interface SimpleTask {
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  description?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export class SimpleLLMLogs {
  private baseDir: string;
  private agentsDir: string;
  private projectFile: string;

  constructor(baseDir: string = './LLM_LOGS') {
    this.baseDir = baseDir;
    this.agentsDir = path.join(baseDir, 'agents');
    this.projectFile = path.join(baseDir, 'projectManagement.md');
  }

  async initialize(): Promise<void> {
    // Create base directory
    if (!existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }

    // Create agents directory
    if (!existsSync(this.agentsDir)) {
      await fs.mkdir(this.agentsDir, { recursive: true });
    }

    // Create project management file if it doesn't exist
    if (!existsSync(this.projectFile)) {
      await this.writeProjectManagement([]);
    }
  }

  // Write tasks for a specific agent
  async writeAgentTasks(agentId: string, tasks: SimpleTask[]): Promise<void> {
    const agentDir = path.join(this.agentsDir, agentId);
    
    // Create agent directory if needed
    if (!existsSync(agentDir)) {
      await fs.mkdir(agentDir, { recursive: true });
    }

    const tasksFile = path.join(agentDir, 'tasks.md');
    const content = this.formatTasksAsMarkdown(tasks, `Agent ${agentId} Tasks`);
    
    await fs.writeFile(tasksFile, content, 'utf-8');
  }

  // Write project management overview with agent structure
  async writeProjectManagement(tasks: SimpleTask[]): Promise<void> {
    const content = await this.formatProjectManagementMarkdown(tasks);
    await fs.writeFile(this.projectFile, content, 'utf-8');
  }

  // Add a single task to an agent
  async addAgentTask(agentId: string, task: SimpleTask): Promise<void> {
    const existingTasks = await this.readAgentTasks(agentId);
    existingTasks.push(task);
    await this.writeAgentTasks(agentId, existingTasks);
    
    // Regenerate project management overview
    await this.regenerateProjectManagement();
  }

  // Add a task to project management
  async addProjectTask(task: SimpleTask): Promise<void> {
    const existingTasks = await this.readProjectManagement();
    existingTasks.push(task);
    await this.writeProjectManagement(existingTasks);
  }

  // Regenerate project management overview with current state
  async regenerateProjectManagement(): Promise<void> {
    const projectTasks = await this.readProjectManagement();
    await this.writeProjectManagement(projectTasks);
  }

  // Update a task status
  async updateTaskStatus(agentId: string, taskTitle: string, status: SimpleTask['status']): Promise<void> {
    const tasks = await this.readAgentTasks(agentId);
    const task = tasks.find(t => t.title === taskTitle);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      await this.writeAgentTasks(agentId, tasks);
      
      // Regenerate project management overview
      await this.regenerateProjectManagement();
    }
  }

  // Read tasks for an agent
  async readAgentTasks(agentId: string): Promise<SimpleTask[]> {
    const tasksFile = path.join(this.agentsDir, agentId, 'tasks.md');
    
    if (!existsSync(tasksFile)) {
      return [];
    }

    try {
      const content = await fs.readFile(tasksFile, 'utf-8');
      return this.parseTasksFromMarkdown(content);
    } catch {
      return [];
    }
  }

  // Read project management tasks
  async readProjectManagement(): Promise<SimpleTask[]> {
    if (!existsSync(this.projectFile)) {
      return [];
    }

    try {
      const content = await fs.readFile(this.projectFile, 'utf-8');
      return this.parseTasksFromMarkdown(content);
    } catch {
      return [];
    }
  }

  // Get all tasks across all agents and project management
  async getAllTasks(): Promise<{ agentTasks: Record<string, SimpleTask[]>, projectTasks: SimpleTask[] }> {
    const result: { agentTasks: Record<string, SimpleTask[]>, projectTasks: SimpleTask[] } = {
      agentTasks: {},
      projectTasks: []
    };

    // Read project tasks
    result.projectTasks = await this.readProjectManagement();

    // Read all agent tasks
    try {
      if (existsSync(this.agentsDir)) {
        const agentDirs = await fs.readdir(this.agentsDir);
        
        for (const agentId of agentDirs) {
          const agentPath = path.join(this.agentsDir, agentId);
          const stat = await fs.stat(agentPath);
          
          if (stat.isDirectory()) {
            result.agentTasks[agentId] = await this.readAgentTasks(agentId);
          }
        }
      }
    } catch {
      // Error reading agent directories
    }

    return result;
  }

  // Format project management with agent structure
  private async formatProjectManagementMarkdown(projectTasks: SimpleTask[]): Promise<string> {
    const now = new Date().toISOString();
    
    let content = `# Project Management Overview\n\n`;
    content += `*Last updated: ${now}*\n\n`;

    // Get all agent tasks
    const { agentTasks } = await this.getAllTasks();
    
    // Overall project stats
    const totalTasks = projectTasks.length + Object.values(agentTasks).flat().length;
    const completedTasks = projectTasks.filter(t => t.status === 'completed').length + 
                          Object.values(agentTasks).flat().filter(t => t.status === 'completed').length;
    
    content += `## 📊 Project Summary\n\n`;
    content += `- **Total Tasks:** ${totalTasks}\n`;
    content += `- **Completed:** ${completedTasks}\n`;
    content += `- **In Progress:** ${Object.values(agentTasks).flat().filter(t => t.status === 'in-progress').length}\n`;
    content += `- **Pending:** ${totalTasks - completedTasks - Object.values(agentTasks).flat().filter(t => t.status === 'in-progress').length}\n\n`;

    // Project-level tasks
    if (projectTasks.length > 0) {
      content += `## 🎯 Project-Level Tasks\n\n`;
      
      const byStatus = {
        'in-progress': projectTasks.filter(t => t.status === 'in-progress'),
        'pending': projectTasks.filter(t => t.status === 'pending'),
        'completed': projectTasks.filter(t => t.status === 'completed'),
        'blocked': projectTasks.filter(t => t.status === 'blocked')
      };

      for (const [status, statusTasks] of Object.entries(byStatus)) {
        if (statusTasks.length === 0) continue;

        content += `### ${status.toUpperCase()} (${statusTasks.length})\n\n`;

        for (const task of statusTasks) {
          const statusIcon = this.getStatusIcon(task.status);
          const priorityBadge = `**${task.priority.toUpperCase()}**`;
          
          content += `${statusIcon} ${priorityBadge} ${task.title}\n`;
          
          if (task.description) {
            content += `   - ${task.description}\n`;
          }
          
          content += `   - Updated: ${new Date(task.updatedAt).toLocaleString()}\n\n`;
        }
      }
    }

    // Agent-specific tasks
    content += `## 🤖 Agent Task Assignments\n\n`;
    
    if (Object.keys(agentTasks).length === 0) {
      content += `No agent-specific tasks yet.\n\n`;
    } else {
      for (const [agentId, tasks] of Object.entries(agentTasks)) {
        if (tasks.length === 0) continue;
        
        const agentName = agentId.includes('gpt') ? '⚡ GPT Agent' :
                         agentId.includes('claude') ? '🔧 Claude Agent' :
                         agentId.includes('gemini') ? '🧠 Gemini Agent' :
                         agentId.includes('o3') ? '🚀 o3 Agent' : `🤖 ${agentId}`;
        
        const completedCount = tasks.filter(t => t.status === 'completed').length;
        const inProgressCount = tasks.filter(t => t.status === 'in-progress').length;
        
        content += `### ${agentName}\n`;
        content += `*Agent ID: ${agentId}*\n`;
        content += `*Progress: ${completedCount}/${tasks.length} completed, ${inProgressCount} in progress*\n\n`;
        
        // Group by status
        const agentTasksByStatus = {
          'in-progress': tasks.filter(t => t.status === 'in-progress'),
          'pending': tasks.filter(t => t.status === 'pending'),
          'completed': tasks.filter(t => t.status === 'completed'),
          'blocked': tasks.filter(t => t.status === 'blocked')
        };

        for (const [status, statusTasks] of Object.entries(agentTasksByStatus)) {
          if (statusTasks.length === 0) continue;

          content += `#### ${status.toUpperCase()} (${statusTasks.length})\n\n`;

          for (const task of statusTasks) {
            const statusIcon = this.getStatusIcon(task.status);
            const priorityBadge = `**${task.priority.toUpperCase()}**`;
            
            content += `- ${statusIcon} ${priorityBadge} ${task.title}\n`;
            
            if (task.description && task.description !== task.title) {
              content += `  - ${task.description}\n`;
            }
            
            content += `  - Created: ${new Date(task.createdAt).toLocaleString()}\n`;
            content += `  - Updated: ${new Date(task.updatedAt).toLocaleString()}\n\n`;
          }
        }
        
        content += `---\n\n`;
      }
    }

    return content;
  }

  // Format tasks as clean markdown
  private formatTasksAsMarkdown(tasks: SimpleTask[], title: string): string {
    const now = new Date().toISOString();
    
    let content = `# ${title}\n\n`;
    content += `*Last updated: ${now}*\n\n`;

    if (tasks.length === 0) {
      content += `No tasks yet.\n\n`;
      return content;
    }

    // Group by status
    const byStatus = {
      'in-progress': tasks.filter(t => t.status === 'in-progress'),
      'pending': tasks.filter(t => t.status === 'pending'),
      'completed': tasks.filter(t => t.status === 'completed'),
      'blocked': tasks.filter(t => t.status === 'blocked')
    };

    for (const [status, statusTasks] of Object.entries(byStatus)) {
      if (statusTasks.length === 0) continue;

      content += `## ${status.toUpperCase()} (${statusTasks.length})\n\n`;

      for (const task of statusTasks) {
        const statusIcon = this.getStatusIcon(task.status);
        const priorityBadge = `**${task.priority.toUpperCase()}**`;
        
        content += `${statusIcon} ${priorityBadge} ${task.title}\n`;
        
        if (task.description) {
          content += `   - ${task.description}\n`;
        }
        
        if (task.assignedTo) {
          content += `   - Assigned to: ${task.assignedTo}\n`;
        }
        
        content += `   - Created: ${new Date(task.createdAt).toLocaleString()}\n`;
        content += `   - Updated: ${new Date(task.updatedAt).toLocaleString()}\n\n`;
      }
    }

    return content;
  }

  // Parse tasks from markdown (basic implementation)
  private parseTasksFromMarkdown(content: string): SimpleTask[] {
    const tasks: SimpleTask[] = [];
    const lines = content.split('\n');
    
    let currentTask: Partial<SimpleTask> | null = null;
    
    for (const line of lines) {
      // Look for task lines (status icon + priority + title)
      const taskMatch = line.match(/^([✅⚡⏳🚫])\s+\*\*(\w+)\*\*\s+(.+)$/);
      
      if (taskMatch) {
        // Save previous task if exists
        if (currentTask && currentTask.title) {
          tasks.push(currentTask as SimpleTask);
        }
        
        // Start new task
        const [, icon, priority, title] = taskMatch;
        currentTask = {
          title: title.trim(),
          priority: priority.toLowerCase() as SimpleTask['priority'],
          status: this.getStatusFromIcon(icon),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else if (currentTask && line.trim().startsWith('- ')) {
        // Parse additional info
        const info = line.trim().substring(2);
        
        if (info.startsWith('Assigned to:')) {
          currentTask.assignedTo = info.substring(12).trim();
        } else if (info.startsWith('Created:')) {
          try {
            currentTask.createdAt = new Date(info.substring(8).trim()).toISOString();
          } catch {
            // Keep default
          }
        } else if (info.startsWith('Updated:')) {
          try {
            currentTask.updatedAt = new Date(info.substring(8).trim()).toISOString();
          } catch {
            // Keep default
          }
        } else if (!info.startsWith('Assigned to:') && !info.startsWith('Created:') && !info.startsWith('Updated:')) {
          // Assume it's description
          currentTask.description = info;
        }
      }
    }
    
    // Save last task
    if (currentTask && currentTask.title) {
      tasks.push(currentTask as SimpleTask);
    }
    
    return tasks;
  }

  private getStatusIcon(status: SimpleTask['status']): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in-progress': return '⚡';
      case 'pending': return '⏳';
      case 'blocked': return '🚫';
      default: return '⏳';
    }
  }

  private getStatusFromIcon(icon: string): SimpleTask['status'] {
    switch (icon) {
      case '✅': return 'completed';
      case '⚡': return 'in-progress';
      case '⏳': return 'pending';
      case '🚫': return 'blocked';
      default: return 'pending';
    }
  }
}

// Global instance
let simpleLogs: SimpleLLMLogs | null = null;

export function getSimpleLLMLogs(): SimpleLLMLogs {
  if (!simpleLogs) {
    simpleLogs = new SimpleLLMLogs();
  }
  return simpleLogs;
}