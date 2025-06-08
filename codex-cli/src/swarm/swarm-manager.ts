import type { AppConfig } from "../utils/config.js";
import type { ApprovalPolicy } from "../approvals.js";
import type { ResponseInputItem, ResponseItem } from "openai/resources/responses/responses.mjs";

import { AgentLoop } from "../utils/agent/agent-loop.js";
import { ReviewDecision } from "../utils/agent/review.js";
import { MultiProviderClient } from "../utils/multi-provider-client.js";
import { GitCoordinator } from "./git-coordinator.js";
import { SharedTodoManager } from "./shared-todo-manager.js";
import { getSimpleLLMLogs } from "../utils/simple-llm-logs.js";
import { log } from "../utils/logger/log.js";
import { WorkDiscovery, type WorkDiscoveryResults } from "./work-discovery.js";

export interface SwarmAgent {
  id: string;
  model: string;
  provider: string;
  agentLoop: AgentLoop;
  status: 'idle' | 'working' | 'error' | 'completed';
  currentTask?: string;
  startTime?: Date;
  lastActivity?: Date;
  recentMessages: Array<{
    timestamp: Date;
    type: 'input' | 'output' | 'thinking';
    content: string;
    summary: string;
  }>;
  currentSubtask?: string;
  progress: number; // 0-100
}

export interface SwarmTask {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAgentId?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  input: ResponseInputItem[];
  output: ResponseItem[];
  startTime?: Date;
  endTime?: Date;
}

export class SwarmManager {
  private config: AppConfig;
  private multiProviderClient: MultiProviderClient;
  private gitCoordinator: GitCoordinator;
  private todoManager: SharedTodoManager;
  private logsManager = getSimpleLLMLogs();
  private agents: Map<string, SwarmAgent> = new Map();
  private tasks: Map<string, SwarmTask> = new Map();
  private onItem: (item: ResponseItem) => void;
  private onLoading: (loading: boolean) => void;
  private isEnabled: boolean = false;
  private primaryCoordinator: SwarmAgent | null = null;
  private workDiscovery: WorkDiscovery;
  private discoveryResults: WorkDiscoveryResults | null = null;
  private conversationHistory: ResponseItem[] = [];
  private projectContext: string = '';

  constructor(
    config: AppConfig,
    approvalPolicy: ApprovalPolicy,
    onItem: (item: ResponseItem) => void,
    onLoading: (loading: boolean) => void
  ) {
    this.config = config;
    this.approvalPolicy = approvalPolicy;
    this.multiProviderClient = new MultiProviderClient(config);
    this.gitCoordinator = new GitCoordinator();
    this.todoManager = new SharedTodoManager();
    this.onItem = onItem;
    this.onLoading = onLoading;
    this.workDiscovery = new WorkDiscovery();
  }

  public async enable(): Promise<boolean> {
    if (this.isEnabled) return true;

    log("Enabling SwarmManager");

    // Initialize simple LLM logs
    await this.logsManager.initialize();

    // Check available models and API keys
    const availableModels = await this.getAvailableModels();
    if (availableModels.length === 0) {
      // Log to project management
      await this.logsManager.addProjectTask({
        title: "Failed to initialize swarm - no models available",
        status: 'blocked',
        priority: 'high',
        description: "No API keys configured for swarm mode",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      this.onItem({
        id: `swarm-no-models-${Date.now()}`,
        type: "message",
        role: "system",
        content: [{
          type: "input_text",
          text: "❌ No models available for swarm mode. Please configure API keys:\n" +
                "- OPENAI_API_KEY for GPT models\n" +
                "- ANTHROPIC_API_KEY for Claude models\n" +
                "- GOOGLE_API_KEY for Gemini models"
        }]
      });
      return false;
    }

    // 🚀 Perform intelligent work discovery
    this.onLoading(true);
    log('🔍 Starting intelligent work discovery...');
    
    try {
      this.discoveryResults = await this.workDiscovery.discover();
      log(`✅ Discovered ${this.discoveryResults.discoveredTasks.length} tasks`);
      
      // Add discovered tasks to todo manager
      for (const task of this.discoveryResults.discoveredTasks) {
        await this.todoManager.createTodo({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: 'pending'
        });
      }
    } catch (error) {
      log(`Warning: Work discovery failed: ${error}`);
    }
    
    this.onLoading(false);

    // Initialize agent pool
    await this.initializeAgentPool(availableModels);
    
    this.isEnabled = true;

    // Log swarm activation to project management
    await this.logsManager.addProjectTask({
      title: `Swarm activated with ${this.agents.size} agents`,
      status: 'completed',
      priority: 'high',
      description: `Models: ${availableModels.map(m => m.model).join(', ')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    const taskSummary = this.discoveryResults ? 
      `\n\n📝 WORK DISCOVERED:\n` +
      `• 🔥 ${this.discoveryResults.summary.highPriority} high priority tasks\n` +
      `• ⚡ ${this.discoveryResults.summary.mediumPriority} medium priority tasks\n` +
      `• 📝 ${this.discoveryResults.summary.lowPriority} low priority tasks\n` +
      `• 🚀 Ready for autonomous execution!` :
      '';

    this.onItem({
      id: `swarm-enabled-${Date.now()}`,
      type: "message",
      role: "system",
      content: [{
        type: "input_text",
        text: `🚀 CYBERPUNK AI SWARM ACTIVATED 🚀\n` +
              `• 🤖 ${this.agents.size} agents deployed: ${availableModels.map(m => `🎨${m.model.split('-')[0]}`).join(' ')}\n` +
              `• ⚙️ Auto-approval enabled - fire and forget mode!\n` +
              `• 🌱 Git coordination active - each agent gets a branch\n` +
              `• 📈 LLM logs: ./LLM_LOGS/ for full transparency\n` +
              `• 📱 Mobile integration ready (scan QR for remote control)` +
              taskSummary +
              `\n\n🎮 Commands: /swarm (disable) | /network (toggle) | /test (validate)`
      }]
    });

    return true;
  }

  public async disable(): Promise<void> {
    if (!this.isEnabled) return;

    log("Disabling SwarmManager");

    // Terminate all agents
    for (const agent of this.agents.values()) {
      try {
        agent.agentLoop.terminate();
      } catch (error) {
        log(`Error terminating agent ${agent.id}: ${error}`);
      }
    }

    this.agents.clear();
    this.tasks.clear();
    this.isEnabled = false;

    this.onItem({
      id: `swarm-disabled-${Date.now()}`,
      type: "message",
      role: "system",
      content: [{
        type: "input_text",
        text: "🔽 Swarm mode disabled. Returning to single-agent mode."
      }]
    });
  }

  private async getAvailableModels(): Promise<Array<{model: string, provider: string}>> {
    const availableModels: Array<{model: string, provider: string}> = [];
    
    // Check all supported providers from the existing system
    const providers = ['openai', 'anthropic', 'google', 'openrouter', 'azure', 'gemini', 'ollama', 'mistral', 'deepseek', 'xai', 'groq', 'arceeai'];
    
    for (const provider of providers) {
      try {
        const { getAvailableModels } = await import('../utils/model-utils.js');
        const models = await getAvailableModels(provider);
        
        if (models.length > 0) {
          log(`Found ${models.length} models for provider ${provider}: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`);
          
          // Add FUNCTION-CALLING COMPATIBLE models only (exclude chatgpt-4o-latest, codex-mini-latest)
          if (provider === 'openai') {
            const compatibleModels = models.filter(m => 
              (m.includes('gpt-4.1') || m.includes('o3') || m.includes('o4-mini')) &&
              !m.includes('chatgpt-4o-latest') && !m.includes('codex-mini-latest')
            ).slice(0, 2);
            log(`🤖 OpenAI compatible models: ${compatibleModels.join(', ')}`);
            compatibleModels.forEach(model => availableModels.push({model, provider}));
          } else if (provider === 'anthropic') {
            const compatibleModels = models.filter(m => 
              m.includes('claude') && m.includes('sonnet-4')
            ).slice(0, 1);
            log(`🤖 Anthropic compatible models: ${compatibleModels.join(', ')}`);
            compatibleModels.forEach(model => availableModels.push({model, provider}));
          } else if (provider === 'google' || provider === 'gemini') {
            const compatibleModels = models.filter(m => 
              m.includes('gemini-2.5-pro')
            ).slice(0, 1);
            log(`🤖 Google compatible models: ${compatibleModels.join(', ')}`);
            compatibleModels.forEach(model => availableModels.push({model, provider}));
          } else {
            // For other providers, take the best available model
            if (models.length > 0) {
              availableModels.push({model: models[0], provider});
            }
          }
        }
      } catch (error) {
        log(`Provider ${provider} not available: ${error}`);
      }
    }

    log(`Total available models for swarm: ${availableModels.length}`);
    return availableModels;
  }

  private async initializeAgentPool(models: Array<{model: string, provider: string}>): Promise<void> {
    // Create one agent per available model with full context and tools
    for (const {model: modelName, provider} of models) {
      const agentId = `agent-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      try {
        // Create AgentLoop with FULL context - same as main agent
        const agentLoop = new AgentLoop({
          model: modelName,
          provider: provider,
          config: this.config,
          instructions: this.config.instructions, // Same instructions as main agent
          approvalPolicy: 'full-auto', // Swarm agents auto-approve
          additionalWritableRoots: [], // Same writable roots as main agent
          onLastResponseId: (id) => log(`🤖 [${modelName.toUpperCase()}] Response: ${id}`),
          onItem: (item) => {
            // Route output through swarm manager with clear model identification
            this.handleAgentOutput(agentId, item);
          },
          onLoading: (loading) => {
            if (loading) {
              log(`🤖 [${modelName.toUpperCase()}] Thinking...`);
            }
            this.updateLoadingState();
          },
          getCommandConfirmation: async (command: Array<string>) => {
            log(`🤖 [${modelName.toUpperCase()}] Auto-approving command: ${command.join(' ')}`);
            return {
              review: ReviewDecision.YES // Auto-approve in swarm mode
            };
          }
        });

        const agent: SwarmAgent = {
          id: agentId,
          model: modelName,
          provider: provider,
          agentLoop,
          status: 'idle',
          lastActivity: new Date(),
          recentMessages: [],
          progress: 0
        };

        this.agents.set(agentId, agent);

        // Designate first Gemini agent as primary coordinator
        if ((modelName.includes('gemini') || modelName.includes('claude')) && !this.primaryCoordinator) {
          this.primaryCoordinator = agent;
          log(`🎯 Designated ${agentId} (${modelName}) as primary coordinator`);
        }

        // Log agent initialization
        await this.logsManager.addProjectTask({
          title: `Agent ${modelName} initialized`,
          status: 'completed',
          priority: 'medium',
          description: `Agent ${agentId} with full context and tools`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        log(`✅ Initialized agent ${agentId} with model ${modelName} (${provider}) - FULL CONTEXT`);
      } catch (error) {
        await this.logsManager.addProjectTask({
          title: `Failed to initialize agent ${modelName}`,
          status: 'blocked',
          priority: 'high',
          description: `Error: ${error}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        log(`❌ Failed to initialize agent for ${modelName}: ${error}`);
      }
    }
  }

  private async handleAgentOutput(agentId: string, item: ResponseItem): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.lastActivity = new Date();

    // Capture agent output in conversation history
    this.captureConversationItem(item);

    // Log to simple system (basic logging only)
    // Complex output logging removed for simplicity

    // Process and enhance the item for display
    let processedItem = { ...item };
    
    // Fix any role issues and add agent branding
    if (processedItem.type === "message") {
      // Ensure role is valid
      if (!processedItem.role || !['user', 'assistant', 'system'].includes(processedItem.role)) {
        processedItem.role = 'assistant'; // Default to assistant for agent output
      }
      
      // Add clear agent identification and current task context
      const currentTaskName = agent.currentTask ? this.getTaskDisplayName(agent.currentTask) : null;
      const agentPrefix = currentTaskName ? 
        `🤖 [${agent.model.toUpperCase()}] Working on: "${currentTaskName}" |` :
        `🤖 [${agent.model.toUpperCase()}]`;
      
      processedItem = {
        ...processedItem,
        content: processedItem.content.map((content: any) => {
          if (content.type === "input_text" && 'text' in content) {
            return {
              ...content,
              text: `${agentPrefix} ${content.text}`
            };
          }
          return content;
        }) as any
      };
    }
    
    // Add agent information for tool calls and other types
    if (processedItem.type === "function_call") {
      // Brand tool calls with agent info
      processedItem.id = `${agent.model}-${processedItem.id}`;
    }
    
    // Always add agent ID to the item ID for tracking
    processedItem.id = `${agentId}-${processedItem.id}`;
    
    // 📝 Capture agent conversation for dashboard display
    this.captureAgentMessage(agentId, item);
    
    // ALWAYS send to main interface so user sees ALL agent activity
    this.onItem(processedItem);

    // Update task status if this agent is working on a task
    if (agent.currentTask) {
      const task = this.tasks.get(agent.currentTask);
      if (task) {
        task.output.push(processedItem);
        task.status = 'in-progress';
        
        // Also update the shared todo status
        await this.todoManager.updateTodoStatus(agent.currentTask, 'in-progress');
        
        // Update agent task status
        await this.logsManager.updateTaskStatus(agent.id, task.description, 'in-progress');
      }
    }
  }

  private updateLoadingState(): void {
    const hasWorkingAgents = Array.from(this.agents.values())
      .some(agent => agent.status === 'working');
    this.onLoading(hasWorkingAgents);
  }

  public async executeTask(input: ResponseInputItem[]): Promise<void> {
    if (!this.isEnabled || this.agents.size === 0) {
      log("Cannot execute task: swarm not enabled or no agents available");
      return;
    }

    const taskDescription = this.extractTaskDescription(input);
    const isWorkDiscoveryTask = taskDescription.includes('DATA CODEX ACTIVATED') || 
                               taskDescription.includes('Intelligent Work Discovery') ||
                               taskDescription.includes('analyze the current codebase');
    
    if (isWorkDiscoveryTask) {
      await this.handleWorkDiscoveryTask(input, taskDescription);
    } else {
      await this.handleRegularTask(input, taskDescription);
    }
  }

  private async handleWorkDiscoveryTask(input: ResponseInputItem[], _taskDescription: string): Promise<void> {
    log(`[SwarmManager] 🔍 Starting comprehensive work discovery phase`);

    // Create discovery todo
    const discoveryTodoId = await this.todoManager.createTodo({
      id: `discovery-${Date.now()}`,
      title: "🔍 Analyzing Codebase for Work Discovery",
      description: "Discovering real work to be done by examining project structure, files, and goals",
      priority: 'high',
      status: 'in-progress',
      assignedAgents: [],
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Also log to simple LLM logs
    await this.logsManager.addProjectTask({
      title: "🔍 Analyzing Codebase for Work Discovery",
      status: 'in-progress',
      priority: 'high',
      description: "Discovering real work to be done by examining project structure, files, and goals",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Assign primary coordinator to do the discovery
    if (this.primaryCoordinator) {
      await this.todoManager.assignTodo(discoveryTodoId, this.primaryCoordinator.id);
      
      // Create enhanced discovery prompt with task assignment tools
      const discoveryPrompt: ResponseInputItem = {
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: `🚀 **SWARM COORDINATOR - WORK DISCOVERY & ASSIGNMENT**

You are the primary coordinator for an AI swarm. You now have special tools to manage tasks and assign work to specialist agents.

**NEW SWARM COORDINATION TOOLS:**
- **CreateTask** - Create a new task/todo
- **AssignTask** - Assign a task to a specialist agent
- **ListAgents** - See available specialist agents

**STEP 1: ANALYZE THE CODEBASE**
Look for real work that needs to be done:
1. **README.md, goals.md, TODO.md** - Explicit goals and tasks
2. **Package.json dependencies** - Outdated or vulnerable packages  
3. **Code quality** - Linting errors, code smells, technical debt
4. **Test coverage** - Untested code and missing test files
5. **Documentation** - Missing or outdated documentation
6. **Build system** - Build errors or optimization opportunities
7. **Security** - Potential security issues
8. **Performance** - Performance bottlenecks

**STEP 2: CREATE & ASSIGN TASKS**
For each real issue you find:
1. Use **CreateTask** to create a specific, actionable task
2. Use **AssignTask** to assign it to the best specialist:
   - **claude-sonnet-4** → Code quality, security, testing, analysis
   - **gpt-4.1** → Dependencies, documentation, quick fixes
   - **o3** → Complex reasoning, performance optimization
   - **gemini** → Coordination and planning (yourself)

**EXAMPLE WORKFLOW:**
If you find TypeScript errors:
1. CreateTask: "Fix TypeScript compilation errors in src/components/"
2. AssignTask: Assign to claude-sonnet-4 (best for code analysis)

**START YOUR ANALYSIS NOW** and use your new tools to create and assign real tasks!`
        }]
      };

      // Execute discovery with the primary coordinator
      await this.primaryCoordinator.agentLoop.run([discoveryPrompt], "");
      
      // After discovery, assign the found tasks to appropriate agents
      setTimeout(async () => {
        await this.assignDiscoveredTasksToAgents();
        await this.todoManager.updateTodoStatus(discoveryTodoId, 'completed');
      }, 10000); // Give time for discovery and todo creation
    }

    // Continue with regular task processing for the discovery itself
    await this.handleRegularTask(input, "Codebase Analysis & Work Discovery");
  }

  /**
   * Assign discovered tasks to the most appropriate specialist agents
   */
  private async assignDiscoveredTasksToAgents(): Promise<void> {
    log(`🎯 Assigning discovered tasks to specialist agents`);
    
    // Get all pending todos (discovered tasks)
    const allTodos = this.getTodos();
    const pendingTodos = allTodos.filter(todo => 
      todo.status === 'pending' && 
      !todo.assignedAgents.length && 
      todo.id !== `discovery-${Date.now()}` // Exclude the discovery task itself
    );

    log(`📋 Found ${pendingTodos.length} discovered tasks to assign`);

    for (const todo of pendingTodos) {
      // Determine best agent type for this task
      const bestAgent = this.selectBestAgentForTodo(todo);
      
      if (bestAgent) {
        // Assign the todo to the agent
        await this.todoManager.assignTodo(todo.id, bestAgent.id);
        
        // Log to agent's simple task file
        await this.logsManager.addAgentTask(bestAgent.id, {
          title: todo.title,
          status: 'pending',
          priority: todo.priority as any,
          description: todo.description,
          assignedTo: bestAgent.model,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        log(`✅ Assigned "${todo.title}" to ${bestAgent.model}`);
        
        // Create and execute the task for this todo
        const taskInput: ResponseInputItem[] = [{
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `🎯 **ASSIGNED TASK:** ${todo.title}

**Description:** ${todo.description}
**Priority:** ${todo.priority.toUpperCase()}

**Your Role:** You are a specialist ${bestAgent.model} agent in the AI swarm.

**Instructions:**
1. Analyze the task requirements carefully
2. Use appropriate tools to complete the work
3. Provide clear updates on your progress
4. Ask for clarification if anything is unclear

**Context:** This task was discovered during our initial codebase analysis and has been specifically assigned to you based on your specialization.

Please begin working on this task now.`
          }]
        }];

        // Execute the task (with a small delay to stagger agent work)
        const delay = pendingTodos.indexOf(todo) * 1000; // 1 second between assignments
        setTimeout(async () => {
          await this.executeTask(taskInput);
        }, delay);
      } else {
        log(`⚠️ No available agent for task: ${todo.title}`);
      }
    }
  }

  /**
   * Select the best agent for a specific todo based on task content and agent specialization
   */
  private selectBestAgentForTodo(todo: any): SwarmAgent | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle');

    if (availableAgents.length === 0) return null;

    const taskTitle = todo.title.toLowerCase();
    const taskDesc = todo.description?.toLowerCase() || '';
    const combined = `${taskTitle} ${taskDesc}`;

    // Task-specific routing based on content
    if (combined.includes('test') || combined.includes('coverage') || combined.includes('spec')) {
      // Testing tasks → Claude (thorough analysis)
      const claudeAgent = availableAgents.find(agent => agent.model.includes('claude'));
      if (claudeAgent) return claudeAgent;
    }

    if (combined.includes('dependency') || combined.includes('package') || combined.includes('update')) {
      // Dependency management → GPT-4.1 (fast execution)
      const gptAgent = availableAgents.find(agent => agent.model.includes('gpt-4.1'));
      if (gptAgent) return gptAgent;
    }

    if (combined.includes('security') || combined.includes('vulnerability') || combined.includes('lint')) {
      // Security & code quality → Claude (thorough analysis)
      const claudeAgent = availableAgents.find(agent => agent.model.includes('claude'));
      if (claudeAgent) return claudeAgent;
    }

    if (combined.includes('performance') || combined.includes('optimization') || combined.includes('complex')) {
      // Performance & complex tasks → o3 (advanced reasoning)
      const o3Agent = availableAgents.find(agent => agent.model.includes('o3'));
      if (o3Agent) return o3Agent;
    }

    if (combined.includes('documentation') || combined.includes('readme') || combined.includes('docs')) {
      // Documentation → GPT-4.1 (fast writing)
      const gptAgent = availableAgents.find(agent => agent.model.includes('gpt-4.1'));
      if (gptAgent) return gptAgent;
    }

    // Default priority order: Claude (quality) → GPT-4.1 (speed) → o3 (reasoning) → Gemini (coordination)
    return availableAgents.find(agent => agent.model.includes('claude')) ||
           availableAgents.find(agent => agent.model.includes('gpt-4.1')) ||
           availableAgents.find(agent => agent.model.includes('o3')) ||
           availableAgents.find(agent => agent.model.includes('gemini')) ||
           availableAgents[0] || null;
  }

  private async handleRegularTask(input: ResponseInputItem[], taskDescription: string): Promise<void> {
    // Create task
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task: SwarmTask = {
      id: taskId,
      description: taskDescription,
      priority: 'medium',
      status: 'pending',
      input,
      output: [],
      startTime: new Date()
    };

    this.tasks.set(taskId, task);

    // Add to shared todo manager 
    await this.todoManager.createTodo({
      id: taskId,
      title: taskDescription,
      description: taskDescription,
      priority: 'medium',
      status: 'pending'
    });

    // Find best agent for this task
    const agent = this.selectBestAgent(task);
    if (!agent) {
      log("No available agents for task");
      task.status = 'failed';
      await this.todoManager.updateTodoStatus(taskId, 'blocked');
      // No available agents - simple log skip
      return;
    }

    // Create git branch for this agent's work
    try {
      const branchName = await this.gitCoordinator.createAgentBranch(agent.id, taskId, {
        id: taskId,
        description: taskDescription,
        priority: 'medium',
        type: 'general',
        assignedAgent: agent.id,
        input: input as any,
        status: 'pending'
      });
      
      log(`Created git branch ${branchName} for agent ${agent.id}`);
    } catch (error) {
      log(`Warning: Could not create git branch for agent: ${error}`);
    }

    // Assign task to agent
    agent.status = 'working';
    agent.currentTask = taskId;
    task.assignedAgentId = agent.id;
    task.status = 'in-progress';

    // Update todo with assignment
    await this.todoManager.assignTodo(taskId, agent.id);
    await this.todoManager.updateTodoStatus(taskId, 'in-progress');

    // Task assigned to agent
    await this.logsManager.addAgentTask(agent.id, {
      title: taskDescription,
      status: 'in-progress',
      priority: 'medium',
      assignedTo: agent.model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    log(`Assigned task ${taskId} to agent ${agent.id} (${agent.model})`);

    try {
      // Input logged (simplified)

      // Enhance input with context if this is a delegated task
      const enhancedInput = await this.enhanceInputWithContext(input, agent, task);
      
      // Validate input before sending to agent
      const validatedInput = enhancedInput.map(item => {
        if (item.type === "message") {
          // Ensure role is valid
          const validRoles = ['user', 'assistant', 'system'] as const;
          if (!validRoles.includes(item.role as any)) {
            log(`Warning: Invalid role '${item.role}' corrected to 'user'`);
            return { ...item, role: 'user' as const };
          }
        }
        return item;
      });

      // Execute task on the selected agent
      await agent.agentLoop.run(validatedInput, "");
      
      // Mark task as completed
      task.status = 'completed';
      task.endTime = new Date();
      agent.status = 'idle';
      agent.currentTask = undefined;

      // Update todo status
      await this.todoManager.updateTodoStatus(taskId, 'completed');

      // Commit the agent's work
      try {
        await this.gitCoordinator.commitAgentWork(
          agent.id,
          taskId,
          `Complete task: ${taskDescription}`,
          [] // Let git auto-detect changed files
        );
      } catch (error) {
        log(`Warning: Could not commit agent work: ${error}`);
      }

      // Mark task completed
      await this.logsManager.updateTaskStatus(agent.id, taskDescription, 'completed');

      log(`Task ${taskId} completed by agent ${agent.id}`);
    } catch (error) {
      // Mark task as failed
      task.status = 'failed';
      task.endTime = new Date();
      agent.status = 'error';
      agent.currentTask = undefined;

      // Update todo status to blocked since we don't have 'failed' status
      await this.todoManager.updateTodoStatus(taskId, 'blocked');

      // Mark task as blocked due to error
      await this.logsManager.updateTaskStatus(agent.id, taskDescription, 'blocked');

      log(`Task ${taskId} failed on agent ${agent.id}: ${error}`);
    }

    this.updateLoadingState();
  }

  private extractTaskDescription(input: ResponseInputItem[]): string {
    for (const item of input) {
      if (item.type === "message" && item.role === "user") {
        for (const content of item.content) {
          if (typeof content === 'object' && 'type' in content && content.type === "input_text" && 'text' in content) {
            return (content as any).text.slice(0, 100);
          }
        }
      }
    }
    return "Unknown task";
  }

  private selectBestAgent(task: SwarmTask): SwarmAgent | null {
    // Get idle agents
    const idleAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle');

    if (idleAgents.length === 0) {
      return null;
    }

    // Always prefer Gemini for coordination and management due to longest context
    const geminiAgent = idleAgents.find(agent => agent.model.includes('gemini-2.5-pro'));
    if (geminiAgent) {
      log(`Selected Gemini agent for coordination: ${geminiAgent.id}`);
      return geminiAgent;
    }

    // Task-specific routing for other models
    const taskLower = task.description.toLowerCase();
    
    if (taskLower.includes('analyze') || taskLower.includes('review') || taskLower.includes('quality')) {
      // Prefer Claude for analysis
      const claudeAgent = idleAgents.find(agent => agent.model.includes('claude-sonnet-4'));
      if (claudeAgent) return claudeAgent;
    }

    if (taskLower.includes('fast') || taskLower.includes('quick') || taskLower.includes('simple')) {
      // Prefer GPT-4.1 for speed
      const gptAgent = idleAgents.find(agent => agent.model.includes('gpt-4.1'));
      if (gptAgent) return gptAgent;
    }

    if (taskLower.includes('complex') || taskLower.includes('reasoning') || taskLower.includes('difficult')) {
      // Prefer o3 for complex reasoning
      const o3Agent = idleAgents.find(agent => agent.model.includes('o3'));
      if (o3Agent) return o3Agent;
    }

    // Default priority order: Gemini -> Claude -> GPT -> o3
    return geminiAgent || 
           idleAgents.find(agent => agent.model.includes('claude-sonnet-4')) ||
           idleAgents.find(agent => agent.model.includes('gpt-4.1')) ||
           idleAgents.find(agent => agent.model.includes('o3')) ||
           idleAgents[0] || null;
  }

  /**
   * 📊 Get detailed agent status for dashboard display
   */
  public getAgentStatus(): Array<{
    id: string;
    model: string;
    status: string;
    currentTask?: string;
    currentSubtask?: string;
    progress: number;
    recentMessages: Array<{
      timestamp: Date;
      type: 'input' | 'output' | 'thinking';
      content: string;
      summary: string;
    }>;
    lastActivity?: Date;
  }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      model: agent.model,
      status: agent.status,
      currentTask: agent.currentTask,
      currentSubtask: agent.currentSubtask,
      progress: agent.progress,
      recentMessages: agent.recentMessages,
      lastActivity: agent.lastActivity
    }));
  }

  public getStatus(): {
    enabled: boolean;
    agentCount: number;
    activeAgents: number;
    pendingTasks: number;
    completedTasks: number;
    agents: { id: string; model: string; status: string }[];
  } {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.tasks.values());

    return {
      enabled: this.isEnabled,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === 'working').length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      agents: agents.map(a => ({
        id: a.id,
        model: a.model,
        status: a.status
      }))
    };
  }

  public async handleUserInput(input: string): Promise<void> {
    if (!this.isEnabled) return;

    // Validate and sanitize input
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      log("Invalid input provided to swarm");
      return;
    }

    // Capture user input in conversation history
    this.captureConversationItem({
      id: `user-input-${Date.now()}`,
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: input.trim() }]
    });

    // Update project context with current work focus
    await this.updateProjectContext(input);

    // Create a comprehensive context-aware prompt for the coordinator
    const contextPrompt = await this.buildContextPrompt(input);
    
    // Route to primary coordinator with full context
    if (this.primaryCoordinator) {
      log(`🎯 Routing user input with context to primary coordinator: ${this.primaryCoordinator.id}`);
      
      const inputItem: ResponseInputItem = {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: contextPrompt }]
      };

      // Send directly to coordinator with context
      await this.primaryCoordinator.agentLoop.run([inputItem], "");
      
      // User input routed to coordinator (simplified logging)
      
    } else {
      // Fallback to regular task execution if no coordinator
      log("[Swarm] No primary coordinator available, using regular task execution");
      const inputItem: ResponseInputItem = {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: input.trim() }]
      };
      await this.executeTask([inputItem]);
    }
  }

  /**
   * Build a comprehensive context prompt that includes recent conversation history,
   * active tasks, and agent coordination information
   */
  private async buildContextPrompt(userInput: string): Promise<string> {
    const contextSections = [];

    // 1. User's current request
    contextSections.push(`**CURRENT USER REQUEST:**
${userInput.trim()}`);

    // 2. Project context - what we've been working on
    if (this.projectContext) {
      contextSections.push(`**PROJECT CONTEXT:**
${this.projectContext}`);
    }

    // 3. Recent conversation context from conversation history
    if (this.conversationHistory.length > 0) {
      const recentContext = this.conversationHistory.slice(-3).map(item => {
        if (item.type === "message" && item.role === "user") {
          const content = item.content.find(c => c.type === "input_text");
          return `- USER: ${content ? (content as any).text.slice(0, 100) : 'User message'}`;
        } else if (item.type === "message" && item.role === "assistant") {
          const content = item.content.find(c => c.type === "output_text");
          return `- ASSISTANT: ${content ? (content as any).text.slice(0, 100) : 'Assistant response'}`;
        }
        return null;
      }).filter(Boolean).join('\n');
      
      if (recentContext) {
        contextSections.push(`**RECENT CONVERSATION:**
${recentContext}`);
      }
    }

    // 4. Active tasks and their status
    const currentTasks = this.getCurrentTasks().filter(task => 
      task.status === 'in-progress' || task.status === 'pending'
    );
    
    if (currentTasks.length > 0) {
      const taskContext = currentTasks.map(task => 
        `- ${task.description} (${task.status}) - Agent: ${task.assignedAgent || 'unassigned'}`
      ).join('\n');
      
      contextSections.push(`**ACTIVE TASKS:**
${taskContext}`);
    }

    // 5. Available agents and their specializations
    const agentStatus = this.getDetailedAgentStatus();
    const availableAgents = agentStatus.filter(agent => agent.status === 'idle').map(agent => 
      `- ${agent.model} (${agent.provider}) - ${this.getAgentSpecialization(agent.model)}`
    ).join('\n');
    
    if (availableAgents) {
      contextSections.push(`**AVAILABLE SPECIALIST AGENTS:**
${availableAgents}`);
    }

    // 6. Shared todos for context
    const todos = this.getTodos().filter(todo => 
      todo.status === 'pending' || todo.status === 'in-progress'
    );
    
    if (todos.length > 0) {
      const todoContext = todos.slice(0, 3).map(todo => 
        `- ${todo.title} (${todo.status}) - Priority: ${todo.priority}`
      ).join('\n');
      
      contextSections.push(`**CURRENT TODOS:**
${todoContext}`);
    }

    // 7. Coordination instructions
    contextSections.push(`**COORDINATION INSTRUCTIONS:**
As the primary coordinator, you have access to the full conversation history and context above. 

For this user request:
1. **Understand the context** - Review the recent conversation and active tasks
2. **Determine the best approach**:
   - Handle directly if it's a simple request or follow-up
   - Delegate to a specialist agent if it requires specific expertise
   - Coordinate multiple agents if it's a complex multi-step task
3. **Maintain context** - When delegating, provide the specialist with relevant background
4. **Provide updates** - Keep the user informed of your coordination decisions

Remember: You are the main agent the user has been talking to. Maintain conversational continuity and acknowledge previous exchanges.`);

    return contextSections.join('\n\n');
  }

  /**
   * Get agent specialization description
   */
  private getAgentSpecialization(model: string): string {
    if (model.includes('gemini')) return 'Coordination & Planning (Primary Coordinator)';
    if (model.includes('claude')) return 'Analysis & Code Quality';
    if (model.includes('gpt-4.1')) return 'Speed & General Tasks';
    if (model.includes('o3')) return 'Complex Reasoning & Problem Solving';
    return 'General Purpose';
  }

  /**
   * Enhance input with context for delegated tasks
   */
  private async enhanceInputWithContext(input: ResponseInputItem[], agent: SwarmAgent, task: SwarmTask): Promise<ResponseInputItem[]> {
    // Add comprehensive context to agent tasks
    const contextualInput = [...input];
    
    // Create a context message to prepend
    const contextSections = [];
    
    // 1. Project context
    if (this.projectContext) {
      contextSections.push(`**PROJECT CONTEXT:**\n${this.projectContext}`);
    }
    
    // 2. Recent conversation summary
    if (this.conversationHistory.length > 0) {
      const recentSummary = this.conversationHistory.slice(-2).map(item => {
        if (item.type === "message" && item.role === "user") {
          const content = item.content.find(c => c.type === "input_text");
          return `User said: ${content ? (content as any).text.slice(0, 80) : 'User message'}`;
        } else if (item.type === "message" && item.role === "assistant") {
          const content = item.content.find(c => c.type === "output_text");
          return `Assistant replied: ${content ? (content as any).text.slice(0, 80) : 'Assistant response'}`;
        }
        return null;
      }).filter(Boolean).join('\n');
      
      if (recentSummary) {
        contextSections.push(`**RECENT CONVERSATION:**\n${recentSummary}`);
      }
    }
    
    // 3. Current task context
    const activeTasks = this.getCurrentTasks().filter(t => t.status === 'in-progress' && t.id !== task.id);
    if (activeTasks.length > 0) {
      const taskList = activeTasks.slice(0, 2).map(t => `- ${t.description}`).join('\n');
      contextSections.push(`**OTHER ACTIVE WORK:**\n${taskList}`);
    }
    
    // 4. Agent specialization reminder
    contextSections.push(`**YOUR ROLE:**\nYou are a ${this.getAgentSpecialization(agent.model)} specialist agent in the AI swarm. You have access to all coding tools and should work autonomously to complete your assigned task.`);
    
    // Only add context if we have meaningful information
    if (contextSections.length > 1) { // More than just the role section
      const contextMessage: ResponseInputItem = {
        type: "message",
        role: "system",
        content: [{
          type: "input_text",
          text: `🤖 **AGENT CONTEXT & BACKGROUND**\n\n${contextSections.join('\n\n')}\n\n---\n\n**NOW STARTING YOUR ASSIGNED TASK:**`
        }]
      };
      
      // Prepend context to the input
      contextualInput.unshift(contextMessage);
    }
    
    return contextualInput;
  }

  /**
   * Execute a task that has been assigned to a specific agent
   */
  public async executeAssignedTask(taskId: string, agentId: string, reason: string): Promise<void> {
    const agent = this.agents.get(agentId);
    const todos = this.getTodos();
    const todo = todos.find(t => t.id === taskId);

    if (!agent || !todo) {
      log(`Cannot execute assigned task: agent ${agentId} or task ${taskId} not found`);
      return;
    }

    log(`🎯 Executing assigned task "${todo.title}" on agent ${agent.model}`);

    // Create git branch for this task
    try {
      const branchName = await this.gitCoordinator.createAgentBranch(agent.id, taskId, {
        id: taskId,
        description: todo.description,
        priority: todo.priority as any,
        type: 'general',
        assignedAgent: agentId,
        input: [],
        status: 'pending'
      });
      
      log(`Created git branch ${branchName} for assigned task`);
    } catch (error) {
      log(`Warning: Could not create git branch for assigned task: ${error}`);
    }

    // Update agent and task status
    agent.status = 'working';
    agent.currentTask = taskId;
    await this.todoManager.updateTodoStatus(taskId, 'in-progress');

    // Create detailed task execution prompt
    const taskInput: ResponseInputItem[] = [{
      type: "message",
      role: "user", 
      content: [{
        type: "input_text",
        text: `🎯 **ASSIGNED TASK FROM SWARM COORDINATOR**

**Task:** ${todo.title}
**Priority:** ${todo.priority.toUpperCase()}
**Description:** ${todo.description}

**Assignment Reason:** ${reason}

**Your Role:** You are a specialist ${agent.model} agent in the AI swarm. This task has been specifically assigned to you based on your expertise.

**Instructions:**
1. **Analyze** the task requirements carefully
2. **Use appropriate tools** to complete the work (Read, Edit, Bash, etc.)
3. **Provide clear updates** on your progress
4. **Be thorough** but efficient
5. **Ask for clarification** if anything is unclear

**Context:** This is real work discovered by analyzing the codebase. Complete it thoroughly and report back when done.

**Begin working on this task now.**`
      }]
    }];

    // Task assignment already logged when task was assigned

    try {
      // Execute the task
      await agent.agentLoop.run(taskInput, "");

      // Mark as completed (will be updated by handleAgentOutput as agent works)
      setTimeout(async () => {
        if (agent.status === 'working' && agent.currentTask === taskId) {
          await this.todoManager.updateTodoStatus(taskId, 'completed');
          agent.status = 'idle';
          agent.currentTask = undefined;

          // Commit the work
          try {
            await this.gitCoordinator.commitAgentWork(
              agent.id,
              taskId,
              `Complete assigned task: ${todo.title}`,
              []
            );
          } catch (error) {
            log(`Warning: Could not commit assigned task work: ${error}`);
          }

          log(`✅ Assigned task "${todo.title}" completed by ${agent.model}`);
        }
      }, 30000); // Mark complete after 30 seconds if still working

    } catch (error) {
      agent.status = 'error';
      agent.currentTask = undefined;
      await this.todoManager.updateTodoStatus(taskId, 'blocked');
      
      // Task failed - already handled by updateTaskStatus

      log(`❌ Assigned task "${todo.title}" failed on ${agent.model}: ${error}`);
    }
  }

  /**
   * Get the todo manager for tools access
   */
  public getTodoManager() {
    return this.todoManager;
  }

  /**
   * Get human-readable task name instead of ID
   */
  private getTaskDisplayName(taskId: string): string {
    // First check internal tasks
    const task = this.tasks.get(taskId);
    if (task) {
      return task.description.length > 60 ? task.description.substring(0, 60) + '...' : task.description;
    }

    // Then check todos
    const todos = this.getTodos();
    const todo = todos.find(t => t.id === taskId);
    if (todo) {
      return todo.title.length > 60 ? todo.title.substring(0, 60) + '...' : todo.title;
    }

    // Fallback to task ID
    return taskId;
  }

  public isSwarmEnabled(): boolean {
    return this.isEnabled;
  }

  // Get detailed agent information including context and queue status
  public getDetailedAgentStatus(): Array<{
    id: string;
    model: string;
    provider: string;
    status: string;
    currentTask?: string;
    contextUsed?: number;
    contextTotal?: number;
    contextPercent?: number;
    queueSize: number;
    startTime?: Date;
    lastActivity?: Date;
  }> {
    return Array.from(this.agents.values()).map(agent => {
      // Get context information from the agent loop if available
      let contextInfo = { used: 0, total: 0, percent: 0 };
      try {
        // Try to get context information from agent loop
        const agentLoop = agent.agentLoop as any;
        if (agentLoop && agentLoop.getContextInfo) {
          contextInfo = agentLoop.getContextInfo();
        }
      } catch (error) {
        // Context info not available
      }

      return {
        id: agent.id,
        model: agent.model,
        provider: agent.provider,
        status: agent.status,
        currentTask: agent.currentTask,
        contextUsed: contextInfo.used,
        contextTotal: contextInfo.total,
        contextPercent: contextInfo.percent,
        queueSize: this.getAgentQueueSize(agent.id),
        startTime: agent.startTime,
        lastActivity: agent.lastActivity
      };
    });
  }

  // Get current tasks/queue for a specific agent
  private getAgentQueueSize(agentId: string): number {
    const agentTasks = Array.from(this.tasks.values()).filter(task => 
      task.assignedAgentId === agentId && 
      (task.status === 'pending' || task.status === 'in-progress')
    );
    return agentTasks.length;
  }

  // Get all current tasks with detailed information
  public getCurrentTasks(): Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    assignedAgent?: string;
    startTime?: Date;
    endTime?: Date;
    progress?: number;
  }> {
    return Array.from(this.tasks.values()).map(task => ({
      id: task.id,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignedAgent: task.assignedAgentId,
      startTime: task.startTime,
      endTime: task.endTime,
      progress: this.calculateTaskProgress(task)
    }));
  }

  private calculateTaskProgress(task: any): number {
    if (task.status === 'completed') return 100;
    if (task.status === 'pending') return 0;
    if (task.status === 'in-progress') {
      // Estimate progress based on time elapsed
      if (task.startTime) {
        const elapsed = Date.now() - task.startTime.getTime();
        const estimatedDuration = 5 * 60 * 1000; // 5 minutes estimated
        return Math.min(95, Math.floor((elapsed / estimatedDuration) * 100));
      }
    }
    return 50; // Default for unknown progress
  }

  // Get todos from the todo manager
  public getTodos(): any[] {
    return this.todoManager.getTodos();
  }

  // Get todo status summary
  public getTodoStatusSummary(): any {
    return this.todoManager.getStatusSummary();
  }

  // Get recent compression events for dashboard display
  public async getRecentCompressionEvents(): Promise<Array<{
    agentId: string;
    model: string;
    timestamp: Date;
    beforeTokens: number;
    afterTokens: number;
    compressionRatio: number;
    reason: string;
  }>> {
    try {
      // This would read from LLM logs to get compression events
      // For now, return empty array - this will be populated when compression actually happens
      return [];
    } catch (error) {
      log(`Error getting compression events: ${error}`);
      return [];
    }
  }

  // Get the current user input being processed
  public getCurrentUserInput(): string | null {
    // Return the most recent user input if any agent is currently processing
    const workingAgent = Array.from(this.agents.values()).find(agent => agent.status === 'working');
    return workingAgent ? "Processing user request..." : null;
  }

  // Get real routing information
  public getCurrentRouting(): { target: string; reason: string } | null {
    if (this.primaryCoordinator) {
      return {
        target: `${this.primaryCoordinator.model} (Primary Coordinator)`,
        reason: "Context preservation and task coordination"
      };
    }
    return null;
  }

  // Calculate real success rate from completed tasks
  public getSuccessRate(): number {
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'completed');
    const totalTasks = this.tasks.size;
    
    if (totalTasks === 0) return 0;
    return Math.round((completedTasks.length / totalTasks) * 100);
  }

  // Calculate real cost from LLM usage
  public getRealTimeCost(): number {
    // This would calculate from actual token usage in LLM logs
    // For now return 0 until we have real token tracking
    return 0;
  }

  // Get primary coordinator info
  public getPrimaryCoordinator(): { id: string; model: string; status: string } | null {
    if (this.primaryCoordinator) {
      return {
        id: this.primaryCoordinator.id,
        model: this.primaryCoordinator.model,
        status: this.primaryCoordinator.status
      };
    }
    return null;
  }

  // Get access to simplified LLM logs
  public getSimpleLLMLogs() {
    return this.logsManager;
  }

  /**
   * Capture conversation items for context tracking
   */
  private captureConversationItem(item: ResponseItem): void {
    // Keep conversation history limited to last 10 items to prevent memory issues
    this.conversationHistory.push(item);
    if (this.conversationHistory.length > 10) {
      this.conversationHistory.shift();
    }
  }

  /**
   * Update project context based on user input and current work
   */
  private async updateProjectContext(userInput: string): Promise<void> {
    try {
      // Build context from current work and input
      const activeWork = this.getCurrentTasks()
        .filter(task => task.status === 'in-progress')
        .map(task => task.description)
        .slice(0, 3);

      const contextParts = [];
      
      if (activeWork.length > 0) {
        contextParts.push(`Currently working on: ${activeWork.join(', ')}`);
      }

      // Add key information from user input
      const inputLower = userInput.toLowerCase();
      if (inputLower.includes('fix') || inputLower.includes('bug') || inputLower.includes('error')) {
        contextParts.push('Focus: Bug fixing and error resolution');
      } else if (inputLower.includes('test') || inputLower.includes('spec')) {
        contextParts.push('Focus: Testing and quality assurance');
      } else if (inputLower.includes('refactor') || inputLower.includes('improve')) {
        contextParts.push('Focus: Code quality and refactoring');
      } else if (inputLower.includes('feature') || inputLower.includes('add') || inputLower.includes('implement')) {
        contextParts.push('Focus: Feature development');
      }

      // Get project info from discovery results
      if (this.discoveryResults) {
        contextParts.push(`Project type: ${this.discoveryResults.projectInfo.type}`);
        contextParts.push(`Total discovered tasks: ${this.discoveryResults.summary.totalTasks}`);
      }

      this.projectContext = contextParts.join('. ') + '.';
      log(`Updated project context: ${this.projectContext}`);
    } catch (error) {
      log(`Error updating project context: ${error}`);
      this.projectContext = 'Working on codebase improvements and development tasks.';
    }
  }

  /**
   * Capture agent conversation messages for dashboard and debugging
   */
  private captureAgentMessage(agentId: string, item: ResponseItem): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    let messageType: 'input' | 'output' | 'thinking' = 'output';
    let content = '';
    let summary = '';

    // Extract content and determine type
    if (item.type === "message") {
      if (item.role === "user") {
        messageType = 'input';
      } else if (item.role === "assistant") {
        messageType = 'output';
      }
      
      // Extract text content
      const textContent = item.content.find(c => c.type === "input_text" || c.type === "output_text");
      if (textContent && 'text' in textContent) {
        content = (textContent as any).text;
        summary = content.slice(0, 100) + (content.length > 100 ? '...' : '');
      }
    } else if (item.type === "function_call") {
      messageType = 'thinking';
      content = `Function call: ${(item as any).name}`;
      summary = content;
    }

    // Add to agent's recent messages
    agent.recentMessages.push({
      timestamp: new Date(),
      type: messageType,
      content,
      summary
    });

    // Keep only last 5 messages per agent
    if (agent.recentMessages.length > 5) {
      agent.recentMessages.shift();
    }

    // Update agent progress if working
    if (agent.status === 'working' && agent.currentTask) {
      agent.progress = Math.min(95, agent.progress + 10);
    }
  }
}