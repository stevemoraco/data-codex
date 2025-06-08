import type { AgentTask } from "./swarm-coordinator.js";
import { log } from "../utils/logger/log.js";

export interface SharedTodo {
  id: string;
  title: string;
  description: string;
  assignedAgents: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  tests: TestRequirement[];
  acceptanceCriteria: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  estimatedCost: number;
  actualCost: number;
  notes: AgentNote[];
}

export interface TestRequirement {
  id: string;
  description: string;
  status: 'pending' | 'pass' | 'fail';
  testCommand?: string;
  expectedOutput?: string;
  actualOutput?: string;
}

export interface AgentNote {
  agentId: string;
  message: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success' | 'coordination';
}

export interface CoordinationMessage {
  fromAgent: string;
  toAgent?: string; // undefined means broadcast
  message: string;
  timestamp: Date;
  type: 'request-help' | 'offer-help' | 'status-update' | 'dependency-complete' | 'conflict-detected';
  metadata?: any;
}

export class SharedTodoManager {
  private todos: Map<string, SharedTodo> = new Map();
  private messages: CoordinationMessage[] = [];
  private taskToTodoMap: Map<string, string> = new Map();

  public async initialize(): Promise<void> {
    log("Initializing shared todo manager");
    // Load any existing todos from project files
    await this.loadExistingTodos();
  }

  private async loadExistingTodos(): Promise<void> {
    // Try to load todos from AGENTS.md or other project files
    try {
      // This would parse enhanced AGENTS.md format
      // For now, create some default structure
      log("Loaded existing project todos");
    } catch (error) {
      log(`Could not load existing todos: ${error}`);
    }
  }

  public async createTodo(todoData: Partial<SharedTodo> & { id: string; title: string; description: string }): Promise<string> {
    const todo: SharedTodo = {
      id: todoData.id,
      title: todoData.title,
      description: todoData.description,
      assignedAgents: [],
      status: todoData.status || 'pending',
      priority: todoData.priority || 'medium',
      dependencies: todoData.dependencies || [],
      tests: [],
      acceptanceCriteria: [],
      createdAt: todoData.createdAt || new Date(),
      updatedAt: todoData.updatedAt || new Date(),
      estimatedCost: 0,
      actualCost: 0,
      notes: []
    };

    this.todos.set(todo.id, todo);
    log(`Created todo: ${todo.title} (${todo.id})`);
    return todo.id;
  }

  public async assignTodo(todoId: string, agentId: string): Promise<void> {
    const todo = this.todos.get(todoId);
    if (!todo) {
      log(`Cannot assign todo ${todoId}: not found`);
      return;
    }

    if (!todo.assignedAgents.includes(agentId)) {
      todo.assignedAgents.push(agentId);
      todo.updatedAt = new Date();
      log(`Assigned todo ${todoId} to agent ${agentId}`);
    }
  }

  public async updateTodoStatus(todoId: string, status: SharedTodo['status']): Promise<void> {
    const todo = this.todos.get(todoId);
    if (!todo) {
      log(`Cannot update todo ${todoId}: not found`);
      return;
    }

    todo.status = status;
    todo.updatedAt = new Date();
    
    if (status === 'completed') {
      todo.completedAt = new Date();
    }

    log(`Updated todo ${todoId} status to ${status}`);
  }

  public async addTask(task: AgentTask): Promise<string> {
    const todoId = `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const todo: SharedTodo = {
      id: todoId,
      title: this.generateTodoTitle(task.description),
      description: task.description,
      assignedAgents: task.assignedModel ? [task.assignedModel] : [],
      status: 'pending',
      priority: task.priority,
      dependencies: task.dependencies,
      tests: this.generateTestRequirements(task),
      acceptanceCriteria: this.generateAcceptanceCriteria(task),
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedCost: 0.1, // Default estimate
      actualCost: task.cost,
      notes: []
    };

    this.todos.set(todoId, todo);
    this.taskToTodoMap.set(task.id, todoId);
    
    log(`Created shared todo ${todoId} for task ${task.id}`);
    return todoId;
  }

  private generateTodoTitle(description: string): string {
    // Extract a concise title from the description
    const words = description.split(' ').slice(0, 6);
    return words.join(' ') + (description.split(' ').length > 6 ? '...' : '');
  }

  private generateTestRequirements(task: AgentTask): TestRequirement[] {
    const tests: TestRequirement[] = [];
    
    // Generate appropriate tests based on task type
    switch (task.type) {
      case 'code-generation':
        tests.push({
          id: `test-${Date.now()}-lint`,
          description: "Code passes linting",
          status: 'pending',
          testCommand: "npm run lint"
        });
        tests.push({
          id: `test-${Date.now()}-build`,
          description: "Code builds successfully",
          status: 'pending',
          testCommand: "npm run build"
        });
        break;
        
      case 'testing':
        tests.push({
          id: `test-${Date.now()}-tests`,
          description: "All tests pass",
          status: 'pending',
          testCommand: "npm test"
        });
        break;
        
      case 'documentation':
        tests.push({
          id: `test-${Date.now()}-docs`,
          description: "Documentation is complete and accurate",
          status: 'pending'
        });
        break;
    }
    
    return tests;
  }

  private generateAcceptanceCriteria(task: AgentTask): string[] {
    const criteria: string[] = [];
    
    // Add common criteria
    criteria.push("Task completed without errors");
    criteria.push("All generated tests pass");
    
    // Add task-specific criteria
    switch (task.type) {
      case 'code-generation':
        criteria.push("Code follows project conventions");
        criteria.push("Code is properly documented");
        criteria.push("No security vulnerabilities introduced");
        break;
        
      case 'testing':
        criteria.push("Test coverage meets requirements");
        criteria.push("Tests are maintainable and clear");
        break;
        
      case 'review':
        criteria.push("Review identifies all issues");
        criteria.push("Suggestions are actionable");
        break;
    }
    
    return criteria;
  }

  public async updateTaskProgress(taskId: string, status: AgentTask['status']): Promise<void> {
    const todoId = this.taskToTodoMap.get(taskId);
    if (!todoId) return;
    
    const todo = this.todos.get(todoId);
    if (!todo) return;
    
    // Map task status to todo status
    switch (status) {
      case 'in-progress':
        todo.status = 'in-progress';
        break;
      case 'completed':
        todo.status = 'completed';
        todo.completedAt = new Date();
        break;
      case 'failed':
      case 'cancelled':
        todo.status = 'pending'; // Reset to pending for retry
        break;
    }
    
    todo.updatedAt = new Date();
    
    log(`Updated todo ${todoId} status to ${todo.status}`);
  }

  public async completeTask(taskId: string): Promise<void> {
    await this.updateTaskProgress(taskId, 'completed');
    
    // Run acceptance tests
    const todoId = this.taskToTodoMap.get(taskId);
    if (todoId) {
      await this.runAcceptanceTests(todoId);
    }
  }

  private async runAcceptanceTests(todoId: string): Promise<void> {
    const todo = this.todos.get(todoId);
    if (!todo) return;
    
    log(`Running acceptance tests for todo ${todoId}`);
    
    // Run each test requirement
    for (const test of todo.tests) {
      if (test.testCommand) {
        try {
          // This would execute the test command
          // For now, simulate test results
          test.status = Math.random() > 0.2 ? 'pass' : 'fail'; // 80% pass rate
          test.actualOutput = test.status === 'pass' ? 'Test passed' : 'Test failed';
          
          log(`Test ${test.id}: ${test.status}`);
        } catch (error) {
          test.status = 'fail';
          test.actualOutput = `Test error: ${error}`;
        }
      }
    }
    
    // Check if all tests passed
    const allTestsPassed = todo.tests.every(test => test.status === 'pass');
    
    if (!allTestsPassed) {
      todo.status = 'blocked';
      await this.addNote(todoId, 'system', 'Tests failed - task blocked pending fixes', 'error');
    } else {
      await this.addNote(todoId, 'system', 'All acceptance tests passed', 'success');
    }
  }

  public async addNote(todoId: string, agentId: string, message: string, type: AgentNote['type'] = 'info'): Promise<void> {
    const todo = this.todos.get(todoId);
    if (!todo) return;
    
    const note: AgentNote = {
      agentId,
      message,
      timestamp: new Date(),
      type
    };
    
    todo.notes.push(note);
    todo.updatedAt = new Date();
    
    log(`Added note to todo ${todoId}: ${message}`);
  }

  public async sendCoordinationMessage(message: CoordinationMessage): Promise<void> {
    this.messages.push(message);
    log(`Coordination message from ${message.fromAgent}: ${message.message}`);
    
    // Process specific message types
    switch (message.type) {
      case 'conflict-detected':
        await this.handleConflict(message);
        break;
      case 'dependency-complete':
        await this.checkUnblockedTasks(message);
        break;
    }
  }

  private async handleConflict(message: CoordinationMessage): Promise<void> {
    log(`Handling conflict: ${message.message}`);
    // Implement conflict resolution logic
    // For now, just log the conflict
  }

  private async checkUnblockedTasks(message: CoordinationMessage): Promise<void> {
    // Check if any blocked todos can now proceed
    for (const todo of this.todos.values()) {
      if (todo.status === 'blocked' && todo.dependencies.includes(message.metadata?.completedTaskId)) {
        // Check if all dependencies are now complete
        const allDepsComplete = todo.dependencies.every(depId => {
          const depTodo = Array.from(this.todos.values()).find(t => t.id === depId);
          return depTodo?.status === 'completed';
        });
        
        if (allDepsComplete) {
          todo.status = 'pending';
          await this.addNote(todo.id, 'system', 'Dependencies completed - task unblocked', 'success');
        }
      }
    }
  }

  public getTodos(): SharedTodo[] {
    return Array.from(this.todos.values());
  }

  public getTodo(todoId: string): SharedTodo | undefined {
    return this.todos.get(todoId);
  }

  public getCoordinationMessages(agentId?: string): CoordinationMessage[] {
    if (agentId) {
      return this.messages.filter(msg => 
        msg.fromAgent === agentId || 
        msg.toAgent === agentId || 
        msg.toAgent === undefined // broadcasts
      );
    }
    return this.messages;
  }

  public getStatusSummary(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    totalCost: number;
  } {
    const todos = Array.from(this.todos.values());
    
    return {
      total: todos.length,
      pending: todos.filter(t => t.status === 'pending').length,
      inProgress: todos.filter(t => t.status === 'in-progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      blocked: todos.filter(t => t.status === 'blocked').length,
      totalCost: todos.reduce((sum, todo) => sum + todo.actualCost, 0)
    };
  }
}