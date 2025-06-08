import type { AgentTask } from "./swarm-coordinator.js";

import { spawn } from "child_process";
import { log } from "../utils/logger/log.js";

export interface GitBranch {
  name: string;
  agentId: string;
  taskId: string;
  baseBranch: string;
  status: 'active' | 'merging' | 'merged' | 'conflicted' | 'abandoned';
  createdAt: Date;
  lastCommit?: string;
  conflictCount: number;
}

export interface GitConflict {
  file: string;
  agentA: string;
  agentB: string;
  taskA: string;
  taskB: string;
  severity: 'minor' | 'major' | 'critical';
  resolution: 'auto' | 'manual' | 'pending';
}

export class GitCoordinator {
  private branches: Map<string, GitBranch> = new Map();
  private conflicts: GitConflict[] = [];
  private baseBranch: string = 'main';
  private lockedFiles: Set<string> = new Set();

  constructor() {
    this.detectBaseBranch();
  }

  private async detectBaseBranch(): Promise<void> {
    try {
      const result = await this.execGit(['branch', '--show-current']);
      if (result.trim()) {
        this.baseBranch = result.trim();
      } else {
        // Fallback to common branch names
        const branches = await this.execGit(['branch', '-r']);
        if (branches.includes('origin/main')) {
          this.baseBranch = 'main';
        } else if (branches.includes('origin/master')) {
          this.baseBranch = 'master';
        }
      }
      log(`Git coordinator using base branch: ${this.baseBranch}`);
    } catch (error) {
      log(`Could not detect base branch, using 'main': ${error}`);
      this.baseBranch = 'main';
    }
  }

  public async createAgentBranch(agentId: string, taskId: string, _task: AgentTask): Promise<string> {
    const branchName = `agent/${agentId}/${taskId}`;
    
    try {
      // Ensure we're on the base branch and it's up to date
      await this.execGit(['checkout', this.baseBranch]);
      await this.execGit(['pull', 'origin', this.baseBranch]).catch(() => {
        // Ignore pull errors (might be working offline)
      });

      // Create new branch from base
      await this.execGit(['checkout', '-b', branchName]);

      const branch: GitBranch = {
        name: branchName,
        agentId,
        taskId,
        baseBranch: this.baseBranch,
        status: 'active',
        createdAt: new Date(),
        conflictCount: 0
      };

      this.branches.set(branchName, branch);
      
      log(`Created git branch for agent ${agentId}: ${branchName}`);
      return branchName;
    } catch (error) {
      log(`Failed to create branch ${branchName}: ${error}`);
      throw error;
    }
  }

  public async switchToAgentBranch(agentId: string, taskId: string): Promise<boolean> {
    const branchName = `agent/${agentId}/${taskId}`;
    const branch = this.branches.get(branchName);
    
    if (!branch) {
      return false;
    }

    try {
      await this.execGit(['checkout', branchName]);
      return true;
    } catch (error) {
      log(`Failed to switch to branch ${branchName}: ${error}`);
      return false;
    }
  }

  public async commitAgentWork(agentId: string, taskId: string, message: string, files?: string[]): Promise<boolean> {
    const branchName = `agent/${agentId}/${taskId}`;
    const branch = this.branches.get(branchName);
    
    if (!branch || branch.status !== 'active') {
      return false;
    }

    try {
      // Check for file locks before committing
      if (files) {
        const conflictingFiles = files.filter(file => this.lockedFiles.has(file));
        if (conflictingFiles.length > 0) {
          log(`Cannot commit, files are locked by other agents: ${conflictingFiles.join(', ')}`);
          return false;
        }
      }

      // Switch to agent branch
      await this.execGit(['checkout', branchName]);

      // Add files (specific files or all changes)
      if (files && files.length > 0) {
        await this.execGit(['add', ...files]);
      } else {
        await this.execGit(['add', '.']);
      }

      // Check if there are changes to commit
      const status = await this.execGit(['status', '--porcelain']);
      if (!status.trim()) {
        log(`No changes to commit for agent ${agentId}`);
        return true;
      }

      // Commit changes
      const fullMessage = `${message}\n\nAgent: ${agentId}\nTask: ${taskId}`;
      await this.execGit(['commit', '-m', fullMessage]);

      // Update last commit hash
      const lastCommit = await this.execGit(['rev-parse', 'HEAD']);
      branch.lastCommit = lastCommit.trim();

      log(`Committed work for agent ${agentId} on ${branchName}`);
      return true;
    } catch (error) {
      log(`Failed to commit work for agent ${agentId}: ${error}`);
      return false;
    }
  }

  public async detectConflicts(branchName: string): Promise<GitConflict[]> {
    const branch = this.branches.get(branchName);
    if (!branch) return [];

    try {
      // Try to merge with base branch to detect conflicts
      await this.execGit(['checkout', branchName]);
      await this.execGit(['fetch', 'origin', this.baseBranch]).catch(() => {});
      
      const mergeResult = await this.execGit(['merge', '--no-commit', '--no-ff', `origin/${this.baseBranch}`])
        .catch(error => error.toString());

      if (mergeResult.includes('CONFLICT')) {
        const conflictFiles = await this.parseConflictFiles();
        const conflicts: GitConflict[] = [];

        for (const file of conflictFiles) {
          // Find which other agents have modified this file
          const blame = await this.getFileBlame(file);
          const conflictingAgents = this.findConflictingAgents(blame, branch.agentId);

          for (const otherAgent of conflictingAgents) {
            conflicts.push({
              file,
              agentA: branch.agentId,
              agentB: otherAgent.agentId,
              taskA: branch.taskId,
              taskB: otherAgent.taskId,
              severity: this.assessConflictSeverity(file),
              resolution: 'pending'
            });
          }
        }

        // Abort the merge
        await this.execGit(['merge', '--abort']).catch(() => {});
        
        return conflicts;
      }

      // No conflicts, abort the merge
      await this.execGit(['merge', '--abort']).catch(() => {});
      return [];
    } catch (error) {
      log(`Error detecting conflicts for ${branchName}: ${error}`);
      return [];
    }
  }

  private async parseConflictFiles(): Promise<string[]> {
    try {
      const result = await this.execGit(['diff', '--name-only', '--diff-filter=U']);
      return result.trim().split('\n').filter(line => line.trim());
    } catch (error) {
      return [];
    }
  }

  private async getFileBlame(file: string): Promise<string> {
    try {
      return await this.execGit(['blame', '--porcelain', file]);
    } catch (error) {
      return '';
    }
  }

  private findConflictingAgents(blame: string, currentAgentId: string): Array<{ agentId: string; taskId: string }> {
    const agents: Array<{ agentId: string; taskId: string }> = [];
    const lines = blame.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('author ')) {
        const match = line.match(/Agent: (\w+).*Task: (\w+)/);
        if (match && match[1] !== currentAgentId) {
          agents.push({ agentId: match[1]!, taskId: match[2]! });
        }
      }
    }
    
    return Array.from(new Set(agents.map(a => JSON.stringify(a)))).map(a => JSON.parse(a));
  }

  private assessConflictSeverity(file: string): 'minor' | 'major' | 'critical' {
    // Simple heuristics for conflict severity
    if (file.includes('package.json') || file.includes('package-lock.json')) {
      return 'critical';
    } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
      return 'major';
    } else if (file.endsWith('.md') || file.endsWith('.txt')) {
      return 'minor';
    }
    return 'major';
  }

  public async mergeAgentBranch(agentId: string, taskId: string): Promise<{ success: boolean; conflicts?: GitConflict[] }> {
    const branchName = `agent/${agentId}/${taskId}`;
    const branch = this.branches.get(branchName);
    
    if (!branch || branch.status !== 'active') {
      return { success: false };
    }

    try {
      // Check for conflicts first
      const conflicts = await this.detectConflicts(branchName);
      if (conflicts.length > 0) {
        branch.status = 'conflicted';
        branch.conflictCount = conflicts.length;
        return { success: false, conflicts };
      }

      // Switch to base branch and merge
      await this.execGit(['checkout', this.baseBranch]);
      await this.execGit(['merge', '--no-ff', branchName, '-m', `Merge agent work: ${taskId}`]);

      // Update branch status
      branch.status = 'merged';
      
      // Clean up branch
      await this.execGit(['branch', '-d', branchName]);
      
      log(`Successfully merged branch ${branchName} for agent ${agentId}`);
      return { success: true };
    } catch (error) {
      branch.status = 'conflicted';
      log(`Failed to merge branch ${branchName}: ${error}`);
      return { success: false };
    }
  }

  public lockFiles(files: string[], agentId: string): boolean {
    const alreadyLocked = files.filter(file => this.lockedFiles.has(file));
    if (alreadyLocked.length > 0) {
      log(`Cannot lock files, already locked: ${alreadyLocked.join(', ')}`);
      return false;
    }

    files.forEach(file => this.lockedFiles.add(file));
    log(`Locked files for agent ${agentId}: ${files.join(', ')}`);
    return true;
  }

  public unlockFiles(files: string[], agentId: string): void {
    files.forEach(file => this.lockedFiles.delete(file));
    log(`Unlocked files for agent ${agentId}: ${files.join(', ')}`);
  }

  public getAgentBranches(): GitBranch[] {
    return Array.from(this.branches.values());
  }

  public getConflicts(): GitConflict[] {
    return this.conflicts;
  }

  public async cleanup(): Promise<void> {
    // Switch back to base branch
    try {
      await this.execGit(['checkout', this.baseBranch]);
    } catch (error) {
      log(`Error switching to base branch during cleanup: ${error}`);
    }

    // Clean up abandoned branches
    for (const [branchName, branch] of this.branches) {
      if (branch.status === 'abandoned') {
        try {
          await this.execGit(['branch', '-D', branchName]);
          this.branches.delete(branchName);
        } catch (error) {
          log(`Error cleaning up branch ${branchName}: ${error}`);
        }
      }
    }

    // Clear all file locks
    this.lockedFiles.clear();
  }

  private async execGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Git command failed: ${args.join(' ')}\n${stderr}`));
        }
      });
    });
  }
}