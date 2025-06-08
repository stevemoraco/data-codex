import type { SwarmManager } from "./swarm-manager.js";

interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<string>;
}

/**
 * Swarm coordination tools for the primary coordinator agent
 */
export function createSwarmCoordinationTools(swarmManager: SwarmManager): Tool[] {
  return [
    {
      name: "CreateTask",
      description: "Create a new task/todo for the swarm to work on",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Clear, specific title for the task (e.g., 'Fix TypeScript errors in src/components/')"
          },
          description: {
            type: "string", 
            description: "Detailed description of what needs to be done, including file paths and specific issues"
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Task priority - high for urgent/blocking issues, medium for important improvements, low for nice-to-have"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to categorize the task (e.g., ['typescript', 'build', 'error'])"
          }
        },
        required: ["title", "description", "priority"]
      },
      execute: async (args: any) => {
        const { title, description, priority } = args;
        
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        await swarmManager.getTodoManager().createTodo({
          id: taskId,
          title,
          description,
          priority,
          status: 'pending',
          assignedAgents: [],
          dependencies: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });

        return `✅ Created task: "${title}" (ID: ${taskId}, Priority: ${priority.toUpperCase()})`;
      }
    },

    {
      name: "AssignTask", 
      description: "Assign a task to a specialist agent",
      parameters: {
        type: "object",
        properties: {
          taskTitle: {
            type: "string",
            description: "The title of the task to assign (must match exactly)"
          },
          agentModel: {
            type: "string",
            enum: ["claude-sonnet-4", "gpt-4.1", "o3", "gemini"],
            description: "Which specialist agent to assign the task to based on their strengths"
          },
          reason: {
            type: "string",
            description: "Brief explanation of why this agent is best suited for this task"
          }
        },
        required: ["taskTitle", "agentModel", "reason"]
      },
      execute: async (args: any) => {
        const { taskTitle, agentModel, reason } = args;
        
        // Find the task by title
        const todos = swarmManager.getTodos();
        const task = todos.find(t => t.title === taskTitle && t.status === 'pending');
        
        if (!task) {
          return `❌ Task not found: "${taskTitle}". Use CreateTask first, then AssignTask.`;
        }

        // Find an available agent of the requested model type
        const agents = swarmManager.getDetailedAgentStatus();
        const availableAgent = agents.find(a => 
          a.model.includes(agentModel) && a.status === 'idle'
        );

        if (!availableAgent) {
          return `❌ No available ${agentModel} agent. Available agents: ${agents.filter(a => a.status === 'idle').map(a => a.model).join(', ')}`;
        }

        // Assign the task
        await swarmManager.getTodoManager().assignTodo(task.id, availableAgent.id);
        await swarmManager.getTodoManager().updateTodoStatus(task.id, 'pending');

        // Execute the task on the assigned agent
        await swarmManager.executeAssignedTask(task.id, availableAgent.id, reason);

        return `✅ Assigned "${taskTitle}" to ${agentModel} agent (${availableAgent.id})\nReason: ${reason}`;
      }
    },

    {
      name: "ListAgents",
      description: "List all available specialist agents and their current status",
      parameters: {
        type: "object",
        properties: {},
        required: []
      },
      execute: async () => {
        const agents = swarmManager.getDetailedAgentStatus();
        
        if (agents.length === 0) {
          return "❌ No agents available in the swarm.";
        }

        const agentList = agents.map(agent => {
          const specialization = getAgentSpecialization(agent.model);
          const status = agent.status === 'idle' ? '✅ Available' : 
                        agent.status === 'working' ? '🔄 Busy' : '❌ Error';
          
          return `• ${agent.model} - ${specialization}\n  Status: ${status}\n  Queue: ${agent.queueSize} tasks\n  Context: ${agent.contextPercent?.toFixed(1) || 0}%`;
        }).join('\n\n');

        return `🤖 **Available Specialist Agents:**\n\n${agentList}`;
      }
    },

    {
      name: "ListTasks",
      description: "List all current tasks and their status",
      parameters: {
        type: "object", 
        properties: {},
        required: []
      },
      execute: async () => {
        const todos = swarmManager.getTodos();
        
        if (todos.length === 0) {
          return "📋 No tasks currently in the system.";
        }

        const taskList = todos.map(todo => {
          const statusIcon = todo.status === 'completed' ? '✅' :
                           todo.status === 'in-progress' ? '⚡' :
                           todo.status === 'pending' ? '⏳' : '🚫';
          
          const assignedTo = todo.assignedAgents.length > 0 ? 
            `Assigned to: ${todo.assignedAgents.join(', ')}` : 
            'Unassigned';

          return `${statusIcon} **${todo.title}** [${todo.priority.toUpperCase()}]\n  ${todo.description}\n  ${assignedTo}\n  Created: ${todo.createdAt?.toLocaleString()}`;
        }).join('\n\n');

        return `📋 **Current Tasks:**\n\n${taskList}`;
      }
    }
  ];
}

function getAgentSpecialization(model: string): string {
  if (model.includes('claude')) return 'Code quality, security, testing, analysis';
  if (model.includes('gpt-4.1')) return 'Dependencies, documentation, quick fixes';
  if (model.includes('o3')) return 'Complex reasoning, performance optimization';
  if (model.includes('gemini')) return 'Coordination and planning';
  return 'General purpose';
}