import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { log } from "../utils/logger/log.js";

export interface DiscoveredTask {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'bug' | 'feature' | 'refactor' | 'test' | 'docs';
  source: string;
  details: string[];
}

export interface WorkDiscoveryResults {
  projectInfo: {
    type: string;
    name: string;
    hasTests: boolean;
    hasLinting: boolean;
    gitStatus: string;
  };
  discoveredTasks: DiscoveredTask[];
  summary: {
    totalTasks: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
}

export class WorkDiscovery {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  public async discover(): Promise<WorkDiscoveryResults> {
    log("🔍 Starting intelligent work discovery...");
    
    const projectInfo = await this.analyzeProject();
    const tasks: DiscoveredTask[] = [];

    // Discover different types of work
    tasks.push(...await this.findBuildErrors());
    tasks.push(...await this.findTestIssues());
    tasks.push(...await this.findTodoComments());
    tasks.push(...await this.findLintingIssues());
    tasks.push(...await this.findDocumentationTasks());
    tasks.push(...await this.findGitIssues());

    const summary = this.calculateSummary(tasks);

    return {
      projectInfo,
      discoveredTasks: tasks,
      summary
    };
  }

  private async analyzeProject() {
    const packageJsonPath = join(this.workingDir, 'package.json');
    let projectInfo = {
      type: 'Unknown',
      name: 'Unknown Project',
      hasTests: false,
      hasLinting: false,
      gitStatus: 'Not a git repository'
    };

    try {
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        projectInfo.name = packageJson.name || 'Unknown Project';
        
        // Detect project type
        if (packageJson.dependencies?.['react'] || packageJson.devDependencies?.['react']) {
          projectInfo.type = 'React';
        } else if (packageJson.dependencies?.['next'] || packageJson.devDependencies?.['next']) {
          projectInfo.type = 'Next.js';
        } else if (packageJson.dependencies?.['express'] || packageJson.devDependencies?.['express']) {
          projectInfo.type = 'Express.js';
        } else if (existsSync(join(this.workingDir, 'tsconfig.json'))) {
          projectInfo.type = 'TypeScript';
        } else {
          projectInfo.type = 'Node.js';
        }

        projectInfo.hasTests = !!(packageJson.scripts?.test || packageJson.devDependencies?.vitest || packageJson.devDependencies?.jest);
        projectInfo.hasLinting = !!(packageJson.scripts?.lint || packageJson.devDependencies?.eslint);
      }

      // Check git status
      try {
        const gitStatus = execSync('git status --porcelain', { cwd: this.workingDir, encoding: 'utf8' });
        projectInfo.gitStatus = gitStatus.trim().length > 0 ? 'Modified files' : 'Clean';
      } catch {
        projectInfo.gitStatus = 'Not a git repository';
      }
    } catch (error) {
      log(`Warning: Could not analyze project: ${error}`);
    }

    return projectInfo;
  }

  private async findBuildErrors(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];
    
    try {
      // Try to run TypeScript check
      try {
        execSync('npm run typecheck', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      } catch (error: any) {
        if (error.stdout?.includes('error TS')) {
          tasks.push({
            id: `build-error-${Date.now()}`,
            title: '🔴 Fix TypeScript compilation errors',
            description: 'TypeScript compilation is failing. Fix type errors to ensure code quality.',
            priority: 'high',
            category: 'bug',
            source: 'TypeScript compiler',
            details: error.stdout.split('\n').filter((line: string) => line.includes('error TS')).slice(0, 5)
          });
        }
      }

      // Try to run build
      try {
        execSync('npm run build', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      } catch (error: any) {
        tasks.push({
          id: `build-fail-${Date.now()}`,
          title: '🔴 Fix build failures',
          description: 'Project build is failing. Resolve build errors to ensure deployability.',
          priority: 'high',
          category: 'bug',
          source: 'Build process',
          details: ['Build command failed', 'Check dependencies and configuration']
        });
      }
    } catch (error) {
      // Scripts don't exist, that's fine
    }

    return tasks;
  }

  private async findTestIssues(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];

    try {
      // Try to run tests
      try {
        execSync('npm test', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      } catch (error: any) {
        if (error.stdout?.includes('failing') || error.stdout?.includes('failed')) {
          tasks.push({
            id: `test-fail-${Date.now()}`,
            title: '🧪 Fix failing tests',
            description: 'Some tests are failing. Fix test failures to ensure code quality.',
            priority: 'medium',
            category: 'test',
            source: 'Test runner',
            details: ['Tests are failing', 'Review test output for specific failures']
          });
        }
      }
    } catch (error) {
      // Test script doesn't exist
      const packageJsonPath = join(this.workingDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (!packageJson.scripts?.test && !packageJson.devDependencies?.vitest && !packageJson.devDependencies?.jest) {
          tasks.push({
            id: `no-tests-${Date.now()}`,
            title: '🧪 Add test infrastructure',
            description: 'Project lacks testing infrastructure. Add tests to ensure code quality.',
            priority: 'medium',
            category: 'test',
            source: 'Missing tests',
            details: ['No test framework detected', 'Consider adding Vitest or Jest']
          });
        }
      }
    }

    return tasks;
  }

  private async findTodoComments(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];

    try {
      const todoOutput = execSync(
        'find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | head -100 | xargs grep -n "TODO\\|FIXME\\|XXX\\|HACK" 2>/dev/null || true',
        { cwd: this.workingDir, encoding: 'utf8' }
      );

      if (todoOutput.trim()) {
        const todoLines = todoOutput.trim().split('\n').slice(0, 10); // Limit to first 10
        tasks.push({
          id: `todos-${Date.now()}`,
          title: `📝 Address ${todoLines.length}+ TODO comments`,
          description: 'Found TODO/FIXME comments that need attention.',
          priority: 'low',
          category: 'refactor',
          source: 'Code comments',
          details: todoLines.map(line => line.substring(0, 100) + (line.length > 100 ? '...' : ''))
        });
      }
    } catch (error) {
      // No todos found or grep failed
    }

    return tasks;
  }

  private async findLintingIssues(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];

    try {
      try {
        execSync('npm run lint', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      } catch (error: any) {
        if (error.stdout?.includes('error') || error.stdout?.includes('warning')) {
          tasks.push({
            id: `lint-issues-${Date.now()}`,
            title: '🔧 Fix linting issues',
            description: 'Code has linting errors or warnings. Fix them to maintain code quality.',
            priority: 'medium',
            category: 'refactor',
            source: 'ESLint',
            details: ['Linting errors detected', 'Run npm run lint:fix to auto-fix some issues']
          });
        }
      }
    } catch (error) {
      // Lint script doesn't exist
    }

    return tasks;
  }

  private async findDocumentationTasks(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];
    const readmePath = join(this.workingDir, 'README.md');

    if (!existsSync(readmePath)) {
      tasks.push({
        id: `no-readme-${Date.now()}`,
        title: '📚 Create README.md',
        description: 'Project lacks a README file. Add documentation for the project.',
        priority: 'low',
        category: 'docs',
        source: 'Missing documentation',
        details: ['No README.md found', 'Add project description, setup instructions, and usage examples']
      });
    } else {
      try {
        const readmeContent = readFileSync(readmePath, 'utf8');
        if (readmeContent.length < 200) {
          tasks.push({
            id: `short-readme-${Date.now()}`,
            title: '📚 Improve README documentation',
            description: 'README.md is very short. Expand it with better documentation.',
            priority: 'low',
            category: 'docs',
            source: 'Insufficient documentation',
            details: ['README is too brief', 'Add setup instructions, usage examples, and contribution guidelines']
          });
        }
      } catch (error) {
        // Ignore read errors
      }
    }

    return tasks;
  }

  private async findGitIssues(): Promise<DiscoveredTask[]> {
    const tasks: DiscoveredTask[] = [];

    try {
      // Check for uncommitted changes
      const gitStatus = execSync('git status --porcelain', { cwd: this.workingDir, encoding: 'utf8' });
      if (gitStatus.trim().length > 0) {
        const changedFiles = gitStatus.trim().split('\n').length;
        tasks.push({
          id: `uncommitted-${Date.now()}`,
          title: `📝 Review ${changedFiles} uncommitted changes`,
          description: 'There are uncommitted changes in the repository. Review and commit them.',
          priority: 'medium',
          category: 'refactor',
          source: 'Git status',
          details: [`${changedFiles} files have changes`, 'Review changes and create appropriate commits']
        });
      }

      // Check for merge conflicts
      try {
        execSync('git diff --check', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      } catch (error: any) {
        if (error.stdout?.includes('conflict')) {
          tasks.push({
            id: `merge-conflicts-${Date.now()}`,
            title: '🔴 Resolve merge conflicts',
            description: 'Repository has merge conflicts that need resolution.',
            priority: 'high',
            category: 'bug',
            source: 'Git conflicts',
            details: ['Merge conflicts detected', 'Resolve conflicts and complete merge']
          });
        }
      }
    } catch (error) {
      // Not a git repository
    }

    return tasks;
  }

  private calculateSummary(tasks: DiscoveredTask[]) {
    return {
      totalTasks: tasks.length,
      highPriority: tasks.filter(t => t.priority === 'high').length,
      mediumPriority: tasks.filter(t => t.priority === 'medium').length,
      lowPriority: tasks.filter(t => t.priority === 'low').length
    };
  }
}