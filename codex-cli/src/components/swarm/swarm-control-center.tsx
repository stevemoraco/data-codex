import type { SwarmManager } from "../../swarm/swarm-manager.js";

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

interface SwarmControlCenterProps {
  swarmCoordinator: SwarmManager | null;
  isEnabled: boolean;
  networkStatus?: string;
  autoApprove?: boolean;
}

interface AgentModel {
  name: string;
  icon: string;
  busy: number;
  total: number;
  queue: number;
  costPerHour: number;
  rateLimit: string;
  contextUsed?: number;
  contextTotal?: number;
  contextPercent?: number;
  currentTask?: string;
}

interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'in-progress' | 'pending' | 'blocked';
  assignedAgents: string[];
  progress: number;
  priority?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SwarmControlCenterComponent = ({ 
  swarmCoordinator, 
  isEnabled, 
  autoApprove 
}: SwarmControlCenterProps): React.ReactElement => {
  const [agentModels, setAgentModels] = useState<AgentModel[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [metrics, setMetrics] = useState({
    totalAgents: 0,
    costPerHour: 0,
    successRate: 0,
    totalCompleted: 0
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isEnabled || !swarmCoordinator) return;

    const updateData = async () => {
      try {
        const status = swarmCoordinator.getStatus();
        const detailedAgents = swarmCoordinator.getDetailedAgentStatus();
        const realTodos = swarmCoordinator.getTodos();
        
        // Also get tasks from simplified LLM logs
        try {
          const { agentTasks, projectTasks } = await swarmCoordinator.getSimpleLLMLogs().getAllTasks();
          
          // Convert simple tasks to todo format
          const simpleTodos = projectTasks.map(task => ({
            id: `simple-${task.title.replace(/\s+/g, '-').toLowerCase()}`,
            title: task.title,
            description: task.description || task.title,
            status: task.status,
            assignedAgents: task.assignedTo ? [task.assignedTo] : [],
            progress: task.status === 'completed' ? 100 : task.status === 'in-progress' ? 50 : 0,
            priority: task.priority,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt)
          }));
          
          // Merge with existing todos (avoid duplicates)
          const mergedTodos = [...realTodos];
          for (const simpleTask of simpleTodos) {
            if (!mergedTodos.find(t => t.title === simpleTask.title)) {
              mergedTodos.push(simpleTask);
            }
          }
          
          // Also add agent tasks to the display
          for (const [agentId, agentTaskList] of Object.entries(agentTasks)) {
            for (const agentTask of agentTaskList) {
              if (!mergedTodos.find(t => t.title === agentTask.title)) {
                mergedTodos.push({
                  id: `agent-${agentId}-${agentTask.title.replace(/\s+/g, '-').toLowerCase()}`,
                  title: agentTask.title,
                  description: agentTask.description || agentTask.title,
                  status: agentTask.status,
                  assignedAgents: agentTask.assignedTo ? [agentTask.assignedTo] : [],
                  progress: agentTask.status === 'completed' ? 100 : agentTask.status === 'in-progress' ? 50 : 0,
                  priority: agentTask.priority,
                  createdAt: new Date(agentTask.createdAt),
                  updatedAt: new Date(agentTask.updatedAt)
                });
              }
            }
          }
          
          // Use merged todos if we found any from LLM logs
          if (simpleTodos.length > 0 || Object.keys(agentTasks).length > 0) {
            setTodos(mergedTodos.map(todo => {
              // Same processing as before
              let progress = 0;
              if (todo.status === 'completed') progress = 100;
              else if (todo.status === 'in-progress') {
                if (todo.updatedAt) {
                  const elapsed = Date.now() - todo.updatedAt.getTime();
                  const estimatedDuration = 10 * 60 * 1000; 
                  progress = Math.min(90, Math.floor((elapsed / estimatedDuration) * 100));
                } else {
                  progress = 10;
                }
              }
              else if (todo.status === 'pending') progress = 0;
              else progress = 25;

              return {
                id: todo.id,
                title: todo.title,
                description: todo.description,
                status: todo.status,
                assignedAgents: todo.assignedAgents,
                progress,
                priority: todo.priority,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt
              };
            }));
            
            if (!isInitialized) {
              setIsInitialized(true);
            }
            return; // Skip the regular processing below
          }
        } catch (error) {
          // Fallback to regular todos if LLM logs fail
        }
        const todoSummary = swarmCoordinator.getTodoStatusSummary();
        
        // Map detailed agents to display models
        const agentsByModel = new Map<string, { 
          busy: number; 
          total: number; 
          agents: typeof detailedAgents 
        }>();
        
        // Map model names to display info
        const modelDisplayInfo = new Map([
          ["gemini-2.5-pro-preview-06-05", { icon: "🧠", costPerHour: 12.00, rateLimit: "6/min" }],
          ["claude-sonnet-4-20250514", { icon: "🔧", costPerHour: 18.00, rateLimit: "5/min" }],
          ["gpt-4.1", { icon: "⚡", costPerHour: 15.00, rateLimit: "8/min" }],
          ["o3", { icon: "🚀", costPerHour: 45.00, rateLimit: "2/min" }]
        ]);
        
        // Group detailed agents by model
        for (const agent of detailedAgents) {
          const modelKey = agent.model;
          if (!agentsByModel.has(modelKey)) {
            agentsByModel.set(modelKey, { busy: 0, total: 0, agents: [] });
          }
          const modelData = agentsByModel.get(modelKey)!;
          modelData.total++;
          modelData.agents.push(agent);
          if (agent.status === 'working') {
            modelData.busy++;
          }
        }
        
        // Create agent models array with ONLY real agents (no placeholders)
        const realAgentModels: AgentModel[] = [];
        
        for (const [modelName, agentData] of agentsByModel) {
          if (agentData.total > 0) {
            const displayInfo = modelDisplayInfo.get(modelName) || { icon: "🤖", costPerHour: 0, rateLimit: "Unknown" };
            const firstAgent = agentData.agents[0];
            
            realAgentModels.push({
              name: modelName,
              icon: displayInfo.icon,
              busy: agentData.busy,
              total: agentData.total,
              queue: agentData.agents.reduce((sum, agent) => sum + agent.queueSize, 0),
              costPerHour: displayInfo.costPerHour,
              rateLimit: displayInfo.rateLimit,
              contextUsed: firstAgent?.contextUsed,
              contextTotal: firstAgent?.contextTotal,
              contextPercent: firstAgent?.contextPercent,
              currentTask: firstAgent?.currentTask
            });
          }
        }

        // Convert real todos to display format with enhanced progression info
        const displayTodos: TodoItem[] = realTodos.map(todo => {
          // Calculate actual progress based on subtasks or activity
          let progress = 0;
          if (todo.status === 'completed') progress = 100;
          else if (todo.status === 'in-progress') {
            // Estimate progress based on time elapsed and agent activity
            if (todo.updatedAt) {
              const elapsed = Date.now() - todo.updatedAt.getTime();
              const estimatedDuration = 10 * 60 * 1000; // 10 minutes estimated
              progress = Math.min(90, Math.floor((elapsed / estimatedDuration) * 100));
            } else {
              progress = 10; // Just started
            }
          }
          else if (todo.status === 'pending') progress = 0;
          else progress = 25; // blocked = 25%

          return {
            id: todo.id,
            title: todo.title,
            description: todo.description,
            status: todo.status,
            assignedAgents: todo.assignedAgents,
            progress,
            priority: todo.priority,
            createdAt: todo.createdAt,
            updatedAt: todo.updatedAt
          };
        });

        setAgentModels(realAgentModels);
        setTodos(displayTodos);
        setMetrics({
          totalAgents: realAgentModels.reduce((sum, model) => sum + model.total, 0),
          costPerHour: swarmCoordinator.getRealTimeCost(),
          successRate: swarmCoordinator.getSuccessRate(),
          totalCompleted: status.completedTasks
        });
        
        if (!isInitialized) {
          setIsInitialized(true);
        }
      } catch (error) {
        // Handle errors silently
      }
    };

    updateData().catch(console.error);
    const interval = setInterval(() => updateData().catch(console.error), 5000); // Slower updates to reduce re-renders
    
    return () => clearInterval(interval);
  }, [isEnabled, swarmCoordinator, isInitialized]);

  // More strict rendering guard
  if (!isEnabled || !swarmCoordinator) {
    return <></>;
  }

  // Only render if swarm is enabled and we have data
  if (!isEnabled || agentModels.length === 0) {
    return <></>;
  }

  const renderProgressBar = (busy: number, total: number, width: number = 20): string => {
    const filled = Math.round((busy / total) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  const renderTaskProgress = (progress: number): string => {
    const blocks = Math.round(progress / 20);
    return '■'.repeat(blocks) + '□'.repeat(5 - blocks);
  };

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyanBright">🚀 CODEX AI SWARM CONTROL CENTER</Text>
      </Box>
      
      {/* Status Line */}
      <Box marginBottom={1}>
        <Text color="blue">Mode: </Text>
        <Text bold color="green">{autoApprove ? '🤖 FULL AUTO' : '⚠️  MANUAL'}</Text>
        <Text color="blue"> | {metrics.totalAgents} agents | </Text>
        <Text color="yellow">${metrics.costPerHour.toFixed(2)}</Text>
        <Text color="blue"> | {metrics.successRate}% success | </Text>
        <Text color="gray">[F1-F4: Controls]</Text>
      </Box>

      {/* Active Instances */}
      <Box marginBottom={1}>
        <Text color="red">🔥 ACTIVE INSTANCES </Text>
        <Text color="gray">(scale with +/-)</Text>
      </Box>

      {agentModels.map((model) => (
        <Box key={model.name} marginLeft={2} flexDirection="column">
          <Box>
            <Text color="yellow">{model.icon} {model.name}</Text>
            <Text color="blue">  [</Text>
            <Text color="cyan">{renderProgressBar(model.busy, model.total)}</Text>
            <Text color="blue">] </Text>
            <Text color="white">{model.busy}/{model.total} busy</Text>
            <Text color="gray"> | Queue: {model.queue}</Text>
          </Box>
          {model.contextPercent !== undefined && (
            <Box marginLeft={4}>
              <Text color="gray">Context: </Text>
              <Text color={model.contextPercent > 80 ? "red" : model.contextPercent > 60 ? "yellow" : "green"}>
                {model.contextPercent.toFixed(1)}%
              </Text>
              <Text color="gray"> ({model.contextUsed?.toLocaleString()}/{model.contextTotal?.toLocaleString()})</Text>
            </Box>
          )}
          {model.currentTask && (
            <Box marginLeft={4}>
              <Text color="blue">Working on: </Text>
              <Text color="cyan">{model.currentTask.substring(0, 50)}...</Text>
            </Box>
          )}
        </Box>
      ))}

      {/* Live Metrics */}
      <Box marginTop={1} marginBottom={1}>
        <Text color="green">📊 LIVE METRICS</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color="blue">Rate Limits: </Text>
        <Text color="yellow">OpenAI 12/min | Claude 8/min</Text>
        <Text color="blue"> | Cost/hr: </Text>
        <Text color="red">${metrics.costPerHour.toFixed(2)}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color="blue">Queue Strategy: </Text>
        <Text color="cyan">COST-FIRST</Text>
        <Text color="blue"> | Auto-scaling: </Text>
        <Text color="green">ON</Text>
        <Text color="blue"> | Mobile: </Text>
        <Text color="yellow">Connected</Text>
      </Box>

      {/* Discovered Tasks & Agent Assignments */}
      <Box marginTop={1} marginBottom={1}>
        <Text color="magenta">🎯 DISCOVERED TASKS & AGENT ASSIGNMENTS</Text>
        <Text color="gray"> ({todos.filter(t => t.status === 'completed').length}/{todos.length} complete)</Text>
      </Box>

      {todos.length === 0 ? (
        <Box marginLeft={2}>
          <Text color="cyan">🔍 Primary coordinator analyzing codebase to discover real work...</Text>
        </Box>
      ) : (
        // Group todos by agent for hierarchical display
        (() => {
          const tasksByAgent = todos.reduce((groups: Record<string, typeof todos>, todo) => {
            const agentKey = todo.assignedAgents.length > 0 ? todo.assignedAgents[0] : 'Project Tasks';
            if (!groups[agentKey]) groups[agentKey] = [];
            groups[agentKey].push(todo);
            return groups;
          }, {});

          return Object.entries(tasksByAgent)
            .sort(([a], [b]) => a === 'Project Tasks' ? -1 : b === 'Project Tasks' ? 1 : a.localeCompare(b))
            .map(([agentKey, agentTodos]) => (
              <Box key={agentKey} marginLeft={2} flexDirection="column" marginBottom={2}>
                {/* Agent Section Header */}
                <Box marginBottom={1}>
                  <Text color="cyan" bold>
                    {agentKey === 'Project Tasks' ? '📋 Project Tasks' : 
                     agentKey.includes('gpt') ? '⚡ GPT Agent Tasks' :
                     agentKey.includes('claude') ? '🔧 Claude Agent Tasks' :
                     agentKey.includes('gemini') ? '🧠 Gemini Agent Tasks' :
                     agentKey.includes('o3') ? '🚀 o3 Agent Tasks' : `🤖 ${agentKey} Tasks`}
                  </Text>
                  <Text color="gray"> ({agentTodos.filter(t => t.status === 'completed').length}/{agentTodos.length} complete)</Text>
                </Box>
                
                {/* Tasks for this agent */}
                {agentTodos
                  .sort((a, b) => {
                    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                    const statusOrder = { 'in-progress': 4, 'pending': 3, 'blocked': 2, 'completed': 1 };
                    
                    const priorityDiff = (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
                                       (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
                    if (priorityDiff !== 0) return priorityDiff;
                    
                    return (statusOrder[b.status as keyof typeof statusOrder] || 0) - 
                           (statusOrder[a.status as keyof typeof statusOrder] || 0);
                  })
                  .map((todo) => (
        <Box key={todo.id} marginLeft={2} flexDirection="column" marginBottom={1}>
          {/* Task Status and Title */}
          <Box>
            {todo.status === 'completed' && <Text color="green">✅ </Text>}
            {todo.status === 'in-progress' && <Text color="yellow">⚡ </Text>}
            {todo.status === 'pending' && <Text color="gray">⏳ </Text>}
            {todo.status === 'blocked' && <Text color="red">🚫 </Text>}
            <Text color="white" bold>{todo.title}</Text>
            {todo.priority && (
              <Text color={todo.priority === 'high' ? 'red' : todo.priority === 'medium' ? 'yellow' : 'gray'}>
                {' '}[{todo.priority.toUpperCase()}]
              </Text>
            )}
          </Box>
          
          {/* Subtasks/Steps if available */}
          {todo.description && todo.description.includes('•') && (
            <Box marginLeft={4} flexDirection="column">
              <Text color="blue">Subtasks:</Text>
              {todo.description.split('•').filter(item => item.trim()).map((subtask, index) => (
                <Box key={index} marginLeft={2}>
                  <Text color="gray">• {subtask.trim()}</Text>
                </Box>
              ))}
            </Box>
          )}
          
          {/* Agent Assignment and Progress */}
          <Box marginLeft={4}>
            <Text color="blue">Agent: </Text>
            {todo.assignedAgents.length > 0 ? (
              <>
                {todo.assignedAgents.map(agentId => {
                  // Extract model name from agent ID for display
                  const modelName = agentId.includes('gemini') ? '🧠 Gemini' :
                                   agentId.includes('claude') ? '🔧 Claude' :
                                   agentId.includes('gpt') ? '⚡ GPT-4.1' :
                                   agentId.includes('o3') ? '🚀 o3' : '🤖 Agent';
                  return (
                    <Text key={agentId} color="cyan">{modelName}</Text>
                  );
                })}
              </>
            ) : (
              <Text color="gray">Awaiting assignment</Text>
            )}
            
            {todo.status === 'in-progress' && (
              <>
                <Text color="blue"> | Progress: [</Text>
                <Text color="cyan">{renderTaskProgress(todo.progress)}</Text>
                <Text color="blue">] </Text>
                <Text color="yellow">{todo.progress}%</Text>
              </>
            )}
          </Box>
          
          {/* Task Description */}
          {todo.description && (
            <Box marginLeft={4}>
              <Text color="gray">{todo.description.length > 80 ? todo.description.substring(0, 80) + '...' : todo.description}</Text>
            </Box>
          )}
          
          {/* Timing Information */}
          <Box marginLeft={4}>
            {todo.createdAt && (
              <Text color="gray">Created: {todo.createdAt.toLocaleTimeString()}</Text>
            )}
            {todo.updatedAt && todo.updatedAt !== todo.createdAt && (
              <Text color="gray"> | Updated: {todo.updatedAt.toLocaleTimeString()}</Text>
            )}
          </Box>
        </Box>
                  ))}
              </Box>
            ))
        })()
      )}

      {/* Continuous Input */}
      <Box marginTop={1} marginBottom={1}>
        <Text color="magenta">💬 CONTINUOUS INPUT</Text>
        <Text color="gray"> (type anytime - non-blocking)</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color="gray">💭 Ready for input - type anything to engage the AI swarm</Text>
      </Box>
    </Box>
  );
};

export const SwarmControlCenter = React.memo(SwarmControlCenterComponent);