import type { AgentTask } from "./swarm-coordinator.js";
import type { SharedTodoManager } from "./shared-todo-manager.js";
import { log } from "../utils/logger/log.js";

export interface InputRouting {
  relevantTasks: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  actionType: 'modification' | 'addition' | 'feedback' | 'question' | 'cancel';
  taskCreations: TaskCreation[];
  taskUpdates: TaskUpdate[];
  broadcastMessage?: string;
}

export interface TaskCreation {
  description: string;
  type: AgentTask['type'];
  priority: AgentTask['priority'];
  dependencies: string[];
}

export interface TaskUpdate {
  taskId: string;
  newDescription: string;
  priority?: AgentTask['priority'];
}

export class InputRouter {
  private _todoManager: SharedTodoManager;

  constructor(todoManager: SharedTodoManager) {
    this._todoManager = todoManager;
  }

  public async routeInput(input: string, activeTasks: AgentTask[]): Promise<InputRouting> {
    log(`Routing user input: ${input.substring(0, 100)}...`);

    const routing: InputRouting = {
      relevantTasks: [],
      urgency: 'medium',
      actionType: 'feedback',
      taskCreations: [],
      taskUpdates: []
    };

    // Analyze input content
    const analysis = await this.analyzeInput(input, activeTasks);
    
    routing.urgency = analysis.urgency;
    routing.actionType = analysis.actionType;
    routing.relevantTasks = analysis.relevantTasks;

    // Handle different action types
    switch (analysis.actionType) {
      case 'modification':
        routing.taskUpdates = await this.generateTaskUpdates(input, analysis.relevantTasks, activeTasks);
        break;
        
      case 'addition':
        routing.taskCreations = await this.generateNewTasks(input);
        break;
        
      case 'feedback':
        routing.broadcastMessage = this.formatFeedbackMessage(input, analysis.relevantTasks);
        break;
        
      case 'question':
        // Questions are handled as high-priority feedback
        routing.urgency = 'high';
        routing.broadcastMessage = `User question: ${input}`;
        break;
        
      case 'cancel':
        // Mark relevant tasks for cancellation
        routing.taskUpdates = analysis.relevantTasks.map(taskId => ({
          taskId,
          newDescription: `CANCELLED: ${input}`
        }));
        break;
    }

    log(`Routed input to ${routing.relevantTasks.length} tasks, ${routing.taskCreations.length} new tasks, ${routing.taskUpdates.length} updates`);
    
    return routing;
  }

  private async analyzeInput(input: string, activeTasks: AgentTask[]): Promise<{
    urgency: InputRouting['urgency'];
    actionType: InputRouting['actionType'];
    relevantTasks: string[];
  }> {
    const inputLower = input.toLowerCase();

    // Determine urgency based on keywords
    let urgency: InputRouting['urgency'] = 'medium';
    if (inputLower.includes('urgent') || inputLower.includes('asap') || inputLower.includes('immediately')) {
      urgency = 'critical';
    } else if (inputLower.includes('important') || inputLower.includes('priority')) {
      urgency = 'high';
    } else if (inputLower.includes('when you can') || inputLower.includes('eventually')) {
      urgency = 'low';
    }

    // Determine action type
    let actionType: InputRouting['actionType'] = 'feedback';
    if (inputLower.includes('stop') || inputLower.includes('cancel') || inputLower.includes('abort')) {
      actionType = 'cancel';
    } else if (inputLower.includes('change') || inputLower.includes('modify') || inputLower.includes('update') || inputLower.includes('instead')) {
      actionType = 'modification';
    } else if (inputLower.includes('also') || inputLower.includes('add') || inputLower.includes('create') || inputLower.includes('new')) {
      actionType = 'addition';
    } else if (inputLower.includes('?') || inputLower.includes('how') || inputLower.includes('what') || inputLower.includes('why')) {
      actionType = 'question';
    }

    // Find relevant tasks based on content analysis
    const relevantTasks = this.findRelevantTasks(input, activeTasks);

    return { urgency, actionType, relevantTasks };
  }

  private findRelevantTasks(input: string, activeTasks: AgentTask[]): string[] {
    const relevantTasks: string[] = [];
    const inputWords = input.toLowerCase().split(/\s+/);

    for (const task of activeTasks) {
      const taskWords = task.description.toLowerCase().split(/\s+/);
      
      // Calculate relevance score based on word overlap
      const commonWords = inputWords.filter(word => 
        word.length > 3 && taskWords.some(taskWord => 
          taskWord.includes(word) || word.includes(taskWord)
        )
      );

      // Consider task relevant if there's significant word overlap
      if (commonWords.length >= 2 || this.hasKeywordMatch(input, task.description)) {
        relevantTasks.push(task.id);
      }
    }

    return relevantTasks;
  }

  private hasKeywordMatch(input: string, taskDescription: string): boolean {
    const inputLower = input.toLowerCase();
    const taskLower = taskDescription.toLowerCase();

    // Check for specific technical terms or component names
    const technicalTerms = [
      'auth', 'database', 'api', 'ui', 'frontend', 'backend', 
      'test', 'component', 'function', 'class', 'endpoint',
      'dark mode', 'header', 'footer', 'navigation', 'form'
    ];

    for (const term of technicalTerms) {
      if (inputLower.includes(term) && taskLower.includes(term)) {
        return true;
      }
    }

    return false;
  }

  private async generateTaskUpdates(
    input: string, 
    relevantTaskIds: string[], 
    activeTasks: AgentTask[]
  ): Promise<TaskUpdate[]> {
    const updates: TaskUpdate[] = [];

    for (const taskId of relevantTaskIds) {
      const task = activeTasks.find(t => t.id === taskId);
      if (!task) continue;

      // Generate updated description based on user input
      const updatedDescription = this.mergeUserFeedback(task.description, input);
      
      updates.push({
        taskId,
        newDescription: updatedDescription,
        priority: this.extractPriorityFromInput(input) || task.priority
      });
    }

    return updates;
  }

  private mergeUserFeedback(originalDescription: string, userInput: string): string {
    // Simple merge - prepend user feedback to original description
    return `${originalDescription}\n\nUser update: ${userInput}`;
  }

  private extractPriorityFromInput(input: string): AgentTask['priority'] | null {
    const inputLower = input.toLowerCase();
    
    if (inputLower.includes('critical') || inputLower.includes('urgent')) {
      return 'critical';
    } else if (inputLower.includes('high priority') || inputLower.includes('important')) {
      return 'high';
    } else if (inputLower.includes('low priority') || inputLower.includes('when you can')) {
      return 'low';
    }
    
    return null;
  }

  private async generateNewTasks(input: string): Promise<TaskCreation[]> {
    const tasks: TaskCreation[] = [];

    // Analyze input to extract task information
    const taskType = this.inferTaskType(input);
    const priority = this.extractPriorityFromInput(input) || 'medium';

    // Check if this is a complex request that should be broken down
    if (this.isComplexRequest(input)) {
      const subtasks = this.breakDownComplexRequest(input);
      for (const subtask of subtasks) {
        tasks.push({
          description: subtask.description,
          type: subtask.type || taskType,
          priority,
          dependencies: subtask.dependencies || []
        });
      }
    } else {
      tasks.push({
        description: input,
        type: taskType,
        priority,
        dependencies: []
      });
    }

    return tasks;
  }

  private inferTaskType(input: string): AgentTask['type'] {
    const inputLower = input.toLowerCase();

    if (inputLower.includes('test') || inputLower.includes('spec')) {
      return 'testing';
    } else if (inputLower.includes('review') || inputLower.includes('check')) {
      return 'review';
    } else if (inputLower.includes('document') || inputLower.includes('readme') || inputLower.includes('comment')) {
      return 'documentation';
    } else if (inputLower.includes('code') || inputLower.includes('implement') || inputLower.includes('create') || inputLower.includes('build')) {
      return 'code-generation';
    }

    return 'general';
  }

  private isComplexRequest(input: string): boolean {
    const complexIndicators = [
      'and', 'also', 'then', 'after', 'before', 'with', 'including',
      'plus', 'as well as', 'along with'
    ];

    const inputLower = input.toLowerCase();
    return complexIndicators.some(indicator => inputLower.includes(indicator)) ||
           input.split(/[.!?]/).length > 1; // Multiple sentences
  }

  private breakDownComplexRequest(input: string): Array<{
    description: string;
    type?: AgentTask['type'];
    dependencies?: string[];
  }> {
    const subtasks: Array<{
      description: string;
      type?: AgentTask['type'];
      dependencies?: string[];
    }> = [];

    // Simple breakdown by coordinating conjunctions and sentence boundaries
    const parts = input.split(/\s+(?:and|also|then|plus|as well as|along with)\s+|[.!?]+\s*/);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || part.trim().length < 10) continue; // Skip very short parts
      
      const trimmedPart = part.trim();
      subtasks.push({
        description: trimmedPart,
        type: this.inferTaskType(trimmedPart),
        dependencies: i > 0 ? [`task-${i-1}`] : [] // Simple sequential dependency
      });
    }

    return subtasks.length > 1 ? subtasks : [{
      description: input,
      type: this.inferTaskType(input)
    }];
  }

  private formatFeedbackMessage(input: string, relevantTaskIds: string[]): string {
    if (relevantTaskIds.length > 0) {
      return `User feedback for tasks [${relevantTaskIds.join(', ')}]: ${input}`;
    } else {
      return `General user feedback: ${input}`;
    }
  }
}