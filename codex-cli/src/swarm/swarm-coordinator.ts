import type { AppConfig } from "../utils/config.js";
import type { ApprovalPolicy } from "../approvals.js";
import type { ResponseInputItem, ResponseItem } from "openai/resources/responses/responses.mjs";

import { ReviewDecision } from "../utils/agent/review.js";

import { AgentLoop } from "../utils/agent/agent-loop.js";
import { ModelInstanceManager } from "./model-instance-manager.js";
import { SharedTodoManager } from "./shared-todo-manager.js";
import { InputRouter } from "./input-router.js";
import { MobileBridge } from "../mobile/mobile-bridge.js";
import { GitCoordinator } from "./git-coordinator.js";
import { MultiProviderClient } from "../utils/multi-provider-client.js";
import { log } from "../utils/logger/log.js";

export interface SwarmConfig {
  maxConcurrentAgents: number;
  costBudget?: number;
  preferredModels?: string[];
  intelligentCoordination: boolean;
}

export interface AgentTask {
  id: string;
  description: string;
  type: 'code-generation' | 'testing' | 'review' | 'documentation' | 'general';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedModel?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  dependencies: string[];
  startTime?: Date;
  endTime?: Date;
  cost: number;
  output?: ResponseItem[];
}

export interface SwarmStatus {
  totalAgents: number;
  activeAgents: number;
  queuedTasks: number;
  completedTasks: number;
  totalCost: number;
  successRate: number;
  isEnabled: boolean;
}

export class SwarmCoordinator {
  private config: AppConfig;
  private swarmConfig: SwarmConfig;
  private modelManager: ModelInstanceManager;
  private todoManager: SharedTodoManager;
  private inputRouter: InputRouter;
  private mobileBridge: MobileBridge;
  private gitCoordinator: GitCoordinator;
  private multiProviderClient: MultiProviderClient;
  private tasks: Map<string, AgentTask> = new Map();
  private activeAgents: Map<string, AgentLoop> = new Map();
  private onItem: (item: ResponseItem) => void;
  private onLoading: (loading: boolean) => void;
  private isEnabled: boolean = false;

  constructor(
    config: AppConfig,
    _approvalPolicy: ApprovalPolicy,
    onItem: (item: ResponseItem) => void,
    onLoading: (loading: boolean) => void
  ) {
    this.config = config;
    this.onItem = onItem;
    this.onLoading = onLoading;
    
    // Initialize multi-provider client first
    this.multiProviderClient = new MultiProviderClient(config);

    // Initialize default swarm configuration with updated models
    this.swarmConfig = {
      maxConcurrentAgents: 5,
      costBudget: 10.0,
      preferredModels: [
        'gemini-2.5-pro-preview-06-05',  // Longest context, good for coordination
        'claude-sonnet-4-20250514',      // High quality
        'gpt-4.1',                       // Reliable
        'o3'                             // Advanced reasoning
      ],
      intelligentCoordination: true
    };

    this.modelManager = new ModelInstanceManager(config);
    this.todoManager = new SharedTodoManager();
    this.inputRouter = new InputRouter(this.todoManager);
    this.mobileBridge = new MobileBridge(config);
    this.gitCoordinator = new GitCoordinator();
  }

  public async enableSwarm(): Promise<void> {
    if (this.isEnabled) {
      return;
    }

    log("Enabling AI swarm mode");
    
    // Check API keys for all preferred models
    const missingProviders = await this.checkRequiredApiKeys();
    if (missingProviders.length > 0) {
      this.onItem({
        id: `swarm-api-key-missing-${Date.now()}`,
        type: "message",
        role: "system",
        content: [{
          type: "input_text",
          text: `⚠️ Missing API keys for: ${missingProviders.join(', ')}. Please set environment variables: ${missingProviders.map(p => `${p.toUpperCase()}_API_KEY`).join(', ')}`
        }]
      });
      
      // Continue with available models only
      const availableModels = this.swarmConfig.preferredModels?.filter(async (modelName) => {
        const modelConfig = this.multiProviderClient.getModelConfig(modelName);
        return modelConfig && await this.multiProviderClient.checkApiKey(modelConfig.provider);
      }) || [];
      
      if (availableModels.length === 0) {
        this.onItem({
          id: `swarm-no-models-${Date.now()}`,
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: `❌ No models available. Please configure API keys and try again.`
          }]
        });
        return;
      }
      
      this.swarmConfig.preferredModels = availableModels;
    }
    
    this.isEnabled = true;
    await this.initializeSwarm();
    
    // Emit status update
    this.onItem({
      id: `swarm-enabled-${Date.now()}`,
      type: "message",
      role: "system",
      content: [{
        type: "input_text",
        text: `🚀 AI Swarm activated with ${this.swarmConfig.maxConcurrentAgents} agents ready for parallel execution. Models: ${this.swarmConfig.preferredModels?.join(', ')}`
      }]
    });

    // Send mobile notification
    await this.mobileBridge.notifySwarmEvent('started', `Swarm activated with ${this.swarmConfig.maxConcurrentAgents} agents`, this.getStatus());
  }

  private async checkRequiredApiKeys(): Promise<string[]> {
    const missingProviders: string[] = [];
    const requiredProviders = new Set<string>();
    
    // Get all providers needed for preferred models
    for (const modelName of this.swarmConfig.preferredModels || []) {
      const modelConfig = this.multiProviderClient.getModelConfig(modelName);
      if (modelConfig) {
        requiredProviders.add(modelConfig.provider);
      }
    }
    
    // Check if each provider has an API key
    for (const provider of requiredProviders) {
      const hasKey = await this.multiProviderClient.checkApiKey(provider);
      if (!hasKey) {
        missingProviders.push(provider);
      }
    }
    
    return missingProviders;
  }

  private async initializeSwarm(): Promise<void> {
    log("Initializing swarm...");
    
    // Scale up model instances based on configuration
    await this.modelManager.scaleToTargets(this.swarmConfig.preferredModels || [], this.swarmConfig.maxConcurrentAgents);
    
    // Initialize shared todo system
    await this.todoManager.initialize();
    
    log(`Swarm initialized with ${this.swarmConfig.maxConcurrentAgents} max agents`);
  }

  public async createTask(
    description: string,
    type: AgentTask['type'] = 'general',
    priority: AgentTask['priority'] = 'medium',
    dependencies: string[] = []
  ): Promise<string> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const task: AgentTask = {
      id: taskId,
      description,
      type,
      priority,
      dependencies,
      status: 'pending',
      cost: 0
    };

    this.tasks.set(taskId, task);
    
    // Add to shared todo system if intelligent coordination is enabled
    if (this.swarmConfig.intelligentCoordination) {
      await this.todoManager.addTask(task);
    }

    // Try to assign immediately if agent available
    await this.tryAssignTask(taskId);
    
    return taskId;
  }

  private async tryAssignTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    // Check if dependencies are completed
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }

    // Check if we have available capacity
    if (this.activeAgents.size >= this.swarmConfig.maxConcurrentAgents) {
      return false;
    }

    // Get optimal model for this task type - prefer Gemini for coordination tasks
    let modelName: string;
    if (task.type === 'general' || task.type === 'code-generation') {
      // Use Gemini for coordination and general tasks due to long context
      modelName = this.multiProviderClient.getSwarmCoordinatorModel();
    } else {
      // For specific tasks, try to get best model from manager
      const selectedModel = await this.modelManager.selectModelForTask(task);
      if (selectedModel && this.multiProviderClient.getSupportedModels().includes(selectedModel)) {
        modelName = selectedModel;
      } else {
        // Fallback to first available model
        const supportedModels = this.multiProviderClient.getSupportedModels();
        const availableModels = [];
        for (const model of supportedModels) {
          const config = this.multiProviderClient.getModelConfig(model);
          if (config && await this.multiProviderClient.checkApiKey(config.provider)) {
            availableModels.push(model);
          }
        }
        
        if (availableModels.length === 0) {
          log(`No available models for task ${taskId}`);
          return false;
        }
        modelName = availableModels[0]!;
      }
    }

    // Verify the model is supported and provider is configured
    const modelConfig = this.multiProviderClient.getModelConfig(modelName);
    if (!modelConfig) {
      log(`Model ${modelName} not supported`);
      return false;
    }

    const hasApiKey = await this.multiProviderClient.checkApiKey(modelConfig.provider);
    if (!hasApiKey) {
      log(`No API key for provider ${modelConfig.provider}`);
      return false;
    }

    // Create git branch for this agent/task
    const agentId = `agent-${Date.now().toString(36)}`;
    let gitBranch: string | null = null;
    
    try {
      gitBranch = await this.gitCoordinator.createAgentBranch(agentId, taskId, task);
      await this.gitCoordinator.switchToAgentBranch(agentId, taskId);
    } catch (error) {
      log(`Warning: Could not create git branch for ${taskId}: ${error}`);
    }

    // Create and start agent
    const agent = new AgentLoop({
      model: modelName,
      provider: this.config.provider || 'openai',
      config: this.config,
      instructions: this.config.instructions,
      approvalPolicy: 'full-auto', // Swarm agents run autonomously
      additionalWritableRoots: [],
      onLastResponseId: (id) => log(`Agent ${taskId} response: ${id}`),
      onItem: (item) => {
        // Track task progress and costs
        this.updateTaskProgress(taskId, item);
        this.onItem(item);
      },
      onLoading: (loading) => {
        // Update global loading state
        this.onLoading(loading && this.activeAgents.size > 0);
      },
      getCommandConfirmation: async () => ({
        review: ReviewDecision.YES // Auto-approve in swarm mode
      })
    });

    // Store agent ID for git coordination
    (task as any).agentId = agentId;
    (task as any).gitBranch = gitBranch;

    this.activeAgents.set(taskId, agent);
    task.status = 'in-progress';
    task.assignedModel = modelName;
    task.startTime = new Date();

    log(`Assigned task ${taskId} to ${modelName}`);

    // Create input for the agent
    const input: ResponseInputItem = {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: task.description
      }]
    };

    // Start the agent
    try {
      await agent.run([input]);
      await this.completeTask(taskId);
    } catch (error) {
      await this.failTask(taskId, error);
    }

    return true;
  }

  private updateTaskProgress(taskId: string, item: ResponseItem): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (!task.output) {
      task.output = [];
    }
    task.output.push(item);

    // Estimate cost (simplified)
    task.cost += 0.001; // Rough estimate per response item
  }

  private async completeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const agentId = (task as any).agentId;
    const gitBranch = (task as any).gitBranch;

    // Commit agent's work to git if branch was created
    if (agentId && gitBranch) {
      try {
        const commitMessage = `Complete task: ${task.description.slice(0, 50)}...`;
        await this.gitCoordinator.commitAgentWork(agentId, taskId, commitMessage);
        
        // Try to merge back to main branch
        const mergeResult = await this.gitCoordinator.mergeAgentBranch(agentId, taskId);
        if (mergeResult.success) {
          log(`Successfully merged agent work for task ${taskId}`);
        } else if (mergeResult.conflicts) {
          log(`Merge conflicts detected for task ${taskId}: ${mergeResult.conflicts.length} conflicts`);
          // For now, we'll mark as completed but with conflicts
          // In a production system, this might trigger conflict resolution
        }
      } catch (error) {
        log(`Error handling git operations for task ${taskId}: ${error}`);
      }
    }

    task.status = 'completed';
    task.endTime = new Date();
    
    this.activeAgents.delete(taskId);
    
    log(`Task ${taskId} completed`);
    
    // Send mobile notification for task completion
    await this.mobileBridge.notifySwarmEvent('completed', `Task completed: ${task.description.slice(0, 50)}...`, this.getStatus());
    
    // Try to assign waiting tasks
    await this.processTaskQueue();
    
    // Update shared todos if intelligent coordination is enabled
    if (this.swarmConfig.intelligentCoordination) {
      await this.todoManager.completeTask(taskId);
    }
  }

  private async failTask(taskId: string, error: any): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.endTime = new Date();
    
    this.activeAgents.delete(taskId);
    
    log(`Task ${taskId} failed: ${error}`);
    
    // Send mobile notification for task failure
    await this.mobileBridge.notifySwarmEvent('error', `Task failed: ${task.description.slice(0, 50)}... Error: ${error}`, this.getStatus());
    
    // Try to assign waiting tasks
    await this.processTaskQueue();
  }

  private async processTaskQueue(): Promise<void> {
    // Find pending tasks and try to assign them
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'pending') {
        const assigned = await this.tryAssignTask(taskId);
        if (!assigned) {
          break; // No more capacity or suitable models
        }
      }
    }
  }

  public async routeUserInput(input: string): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const routing = await this.inputRouter.routeInput(input, Array.from(this.tasks.values()));
    
    // Create tasks based on routing decisions
    for (const decision of routing.taskCreations) {
      await this.createTask(decision.description, decision.type, decision.priority);
    }

    // Update existing tasks
    for (const update of routing.taskUpdates) {
      const task = this.tasks.get(update.taskId);
      if (task) {
        task.description = update.newDescription;
        // Restart task if needed
        if (task.status === 'in-progress') {
          await this.failTask(update.taskId, 'Updated by user input');
          task.status = 'pending';
          await this.tryAssignTask(update.taskId);
        }
      }
    }
  }

  public getStatus(): SwarmStatus {
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'completed');
    const totalTasks = this.tasks.size;
    
    return {
      totalAgents: this.swarmConfig.maxConcurrentAgents,
      activeAgents: this.activeAgents.size,
      queuedTasks: Array.from(this.tasks.values()).filter(t => t.status === 'pending').length,
      completedTasks: completedTasks.length,
      totalCost: Array.from(this.tasks.values()).reduce((sum, task) => sum + task.cost, 0),
      successRate: totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0,
      isEnabled: this.isEnabled
    };
  }

  public async disable(): Promise<void> {
    log("Disabling swarm mode");
    
    // Cancel all active agents
    for (const [taskId, agent] of this.activeAgents) {
      agent.terminate();
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'cancelled';
      }
    }
    
    this.activeAgents.clear();
    this.isEnabled = false;
    
    // Clean up git coordination
    await this.gitCoordinator.cleanup();
    
    // Disconnect mobile bridge
    this.mobileBridge.disconnect();
    
    this.onItem({
      id: `swarm-disabled-${Date.now()}`,
      type: "message",
      role: "system",
      content: [{
        type: "input_text",
        text: "🔽 Multi-agent mode disabled"
      }]
    });
  }

  public getMobileBridge(): MobileBridge {
    return this.mobileBridge;
  }
}