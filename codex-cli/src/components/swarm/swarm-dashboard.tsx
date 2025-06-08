import type { SwarmManager } from "../../swarm/swarm-manager.js";

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

interface SwarmDashboardProps {
  swarmCoordinator: SwarmManager | null;
  isEnabled: boolean;
  networkStatus?: string;
  autoApprove?: boolean;
}

export function SwarmDashboard({ swarmCoordinator, isEnabled, networkStatus, autoApprove }: SwarmDashboardProps): React.ReactElement {
  const [status, setStatus] = useState({
    enabled: false,
    agentCount: 0,
    activeAgents: 0,
    pendingTasks: 0,
    completedTasks: 0,
    agents: [] as { id: string; model: string; status: string }[]
  });
  
  const [agentDetails, setAgentDetails] = useState<Array<{
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
  }>>([]);
  
  const [lastUpdateHash, setLastUpdateHash] = useState<string>('');

  // Update status only when there are actual changes
  useEffect(() => {
    if (!isEnabled || !swarmCoordinator) return;

    const updateStatus = () => {
      try {
        const newStatus = swarmCoordinator.getStatus();
        const newAgentDetails = swarmCoordinator.getAgentStatus();
        
        // Create a hash of the current state to detect changes
        const stateHash = JSON.stringify({
          enabled: newStatus.enabled,
          agentCount: newStatus.agentCount,
          activeAgents: newStatus.activeAgents,
          pendingTasks: newStatus.pendingTasks,
          completedTasks: newStatus.completedTasks,
          agentDetailsCount: newAgentDetails.length
        });
        
        // Only update if something actually changed
        if (stateHash !== lastUpdateHash) {
          setStatus(newStatus);
          setAgentDetails(newAgentDetails);
          setLastUpdateHash(stateHash);
        }
      } catch (error) {
        // Handle any errors silently
      }
    };

    updateStatus(); // Initial update
    const interval = setInterval(updateStatus, 2000); // Reduced frequency to 2 seconds
    
    return () => clearInterval(interval);
  }, [isEnabled, swarmCoordinator, lastUpdateHash]);


  if (!isEnabled) {
    return <></>;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Compact Header - Single Line */}
      <Box paddingX={1}>
        <Text>
          <Text color="cyan">◢◤ </Text>
          <Text bold color="whiteBright">SWARM</Text>
          <Text color="cyan"> ◢◤ </Text>
          <Text color="magenta">⚡{status.activeAgents}</Text>
          <Text color="gray">/</Text>
          <Text color="blue">{status.agentCount}</Text>
          <Text color="gray"> </Text>
          <Text color="blue">{status.pendingTasks}Q</Text>
          {status.completedTasks > 0 && (
            <>
              <Text color="gray"> </Text>
              <Text color="green">✅{status.completedTasks}</Text>
            </>
          )}
          {autoApprove && (
            <>
              <Text color="gray"> </Text>
              <Text color="red">🚀AUTO</Text>
            </>
          )}
        </Text>
      </Box>

      {/* Model Instance Status - Only show if there are agents */}
      {status.agents.length > 0 && (
        <Box paddingX={1}>
          <Text color="blue">🧠 Models: </Text>
          {getAgentStats(status.agents).slice(0, 3).map(([modelName, stats], index) => (
            <Text key={modelName}>
              {index > 0 && <Text color="gray"> | </Text>}
              <Text color="cyan">{getModelIcon(modelName)}</Text>
              <Text color="gray">{modelName.split('-')[0]}</Text>
              <Text color="yellow">:{stats.working}</Text>
              <Text color="gray">/{stats.total}</Text>
            </Text>
          ))}
        </Box>
      )}

      {/* Input Status - Compact */}
      <Box paddingX={1}>
        <Text color="magenta">⚡ INPUT: </Text>
        <Text color="green">READY - Type anytime, no blocking!</Text>
        {networkStatus && (
          <>
            <Text color="gray"> | </Text>
            <Text>{networkStatus}</Text>
          </>
        )}
        {autoApprove && (
          <>
            <Text color="gray"> | </Text>
            <Text color="red">Use /swarm to disable auto-approve</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

function getModelIcon(modelName: string): string {
  if (modelName.includes('gpt')) return '⚡';
  if (modelName.includes('claude')) return '🔧';
  if (modelName.includes('gemini')) return '🧠';
  if (modelName.includes('o1')) return '🚀';
  return '🤖';
}

function getAgentStats(agents: { id: string; model: string; status: string }[]): Array<[string, {
  total: number;
  working: number;
  idle: number;
}]> {
  const stats = new Map<string, {
    total: number;
    working: number;
    idle: number;
  }>();

  for (const agent of agents) {
    const modelName = agent.model;
    if (!stats.has(modelName)) {
      stats.set(modelName, { total: 0, working: 0, idle: 0 });
    }
    
    const modelStats = stats.get(modelName)!;
    modelStats.total++;
    
    if (agent.status === 'working') {
      modelStats.working++;
    } else if (agent.status === 'idle') {
      modelStats.idle++;
    }
  }

  return Array.from(stats.entries());
}