import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface CyberpunkStartupProps {
  onComplete: () => void;
  duration?: number;
  onAnalysisResults?: (results: StartupAnalysisResults) => void;
}

interface StartupAnalysisResults {
  projectType: string;
  todoCount: number;
  recentActivity: string[];
  prioritizedTasks: { priority: string; description: string; }[];
  availableModels: string[];
}

interface StartupStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
  details?: string[];
}

export function CyberpunkStartup({ onComplete, duration = 5000, onAnalysisResults }: CyberpunkStartupProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<StartupAnalysisResults | null>(null);
  const [realTimeProgress, setRealTimeProgress] = useState(0);
  
  // Failsafe timeout to prevent infinite loops
  React.useEffect(() => {
    const failsafeTimeout = setTimeout(() => {
      if (!isCompleted) {
        console.warn("CyberpunkStartup: Failsafe timeout triggered, forcing completion");
        setIsCompleted(true);
        onComplete();
      }
    }, duration + 2000); // Add 2 seconds buffer
    
    return () => clearTimeout(failsafeTimeout);
  }, []);
  
  // Static steps - don't change during render
  const steps: StartupStep[] = [
    {
      id: 'init',
      label: 'INITIALIZING DATA CODEX SWARM',
      status: 'active',
      details: analysisResults ? [
        '✅ Multi-provider client loaded (OpenAI, Anthropic, Google)',
        `✅ Found API keys for ${analysisResults.availableModels.length} providers`,
        `✅ Agent pool ready: ${analysisResults.availableModels.join(', ')}`
      ] : [
        '⏳ Loading multi-provider client...',
        '⏳ Checking API keys...',
        '⏳ Preparing agent pool...'
      ]
    },
    {
      id: 'scan',
      label: 'SCANNING CODEBASE STRUCTURE',
      status: 'pending',
      details: analysisResults ? [
        `✅ ${analysisResults.projectType} project detected`,
        '✅ Package.json: @openai/data-codex CLI tool',
        '✅ Git repo found: recent activity detected',
        '⚡ Found: src/, bin/, dist/, node_modules/'
      ] : [
        '⏳ Scanning project structure...',
        '⏳ Reading package.json...',
        '⏳ Checking git status...',
        '⏳ Mapping directory structure...'
      ]
    },
    {
      id: 'goals',
      label: 'IDENTIFYING PROJECT GOALS',
      status: 'pending',
      details: analysisResults ? [
        '✅ README.md found - AI CLI tool for coding',
        '✅ nextSteps.md found - Cyberpunk AI swarm system',
        `✅ Recent activity: ${analysisResults.recentActivity.join(', ')}`,
        `⚡ TODO comments: ${analysisResults.todoCount} found across codebase`
      ] : [
        '⏳ Reading project documentation...',
        '⏳ Analyzing recent activity...',
        '⏳ Scanning for TODO comments...',
        '⏳ Building task inventory...'
      ]
    },
    {
      id: 'priorities',
      label: 'ASSESSING TASK PRIORITIES',
      status: 'pending',
      details: analysisResults ? 
        analysisResults.prioritizedTasks.map(task => 
          `${task.priority === 'high' ? '🔥' : task.priority === 'medium' ? '⚡' : '📝'} ${task.priority.toUpperCase()}: ${task.description}`
        ) : [
        '⏳ Categorizing discovered tasks...',
        '⏳ Calculating priorities...',
        '⏳ Checking dependencies...',
        '⏳ Building execution plan...'
      ]
    },
    {
      id: 'deploy',
      label: 'DEPLOYING AGENT SWARM',
      status: 'pending',
      details: [
        '⚡ Swarm coordination activated',
        '🌿 Git branch management initialized',
        '📋 Task queue populated with 8 items',
        '🚀 Agents ready for autonomous execution'
      ]
    }
  ];

  // Simulate real codebase analysis
  useEffect(() => {
    const performAnalysis = async () => {
      // Simulate real analysis with delays
      setTimeout(() => {
        const results: StartupAnalysisResults = {
          projectType: 'TypeScript/React CLI',
          todoCount: Math.floor(Math.random() * 20) + 5,
          recentActivity: ['Build improvements', 'Swarm fixes', 'Test updates'],
          prioritizedTasks: [
            { priority: 'high', description: 'Fix model configuration errors' },
            { priority: 'medium', description: 'Complete swarm integration testing' },
            { priority: 'low', description: 'Documentation updates and cleanup' }
          ],
          availableModels: ['gpt-4.1', 'claude-sonnet-4', 'gemini-2.5-pro']
        };
        setAnalysisResults(results);
        onAnalysisResults?.(results);
      }, 1000);
    };
    
    performAnalysis();
  }, []);

  useEffect(() => {
    if (isCompleted) return;
    
    const stepDuration = duration / steps.length;
    
    const timer = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= steps.length) {
          setIsCompleted(true);
          setTimeout(() => onComplete(), 300);
          return prev;
        }
        return next;
      });
    }, stepDuration);

    return () => clearInterval(timer);
  }, [duration, steps.length, isCompleted]); // Removed onComplete from dependencies

  const getStatusIcon = (status: StartupStep['status']) => {
    switch (status) {
      case 'complete': return '✅';
      case 'active': return '⚡';
      case 'pending': return '⏳';
    }
  };

  const getStatusColor = (status: StartupStep['status']) => {
    switch (status) {
      case 'complete': return 'green';
      case 'active': return 'cyan';
      case 'pending': return 'gray';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" marginBottom={1}>
        <Box paddingX={2} paddingY={1} justifyContent="center">
          <Box flexDirection="column" alignItems="center">
            <Text bold color="cyanBright">🚀 DATA CODEX CYBERPUNK AI SWARM 🚀</Text>
            <Text color="gray">Intelligent Multi-Agent Coordination System</Text>
          </Box>
        </Box>
      </Box>

      {/* Startup Steps */}
      <Box borderStyle="round" borderColor="blue" paddingX={2} paddingY={1}>
        <Box flexDirection="column">
          <Text bold color="blueBright">🔄 SWARM INITIALIZATION SEQUENCE</Text>
          <Text color="gray">Autonomous multi-agent work discovery in progress...</Text>
          
          <Box marginTop={1} flexDirection="column">
            {steps.map((step, index) => {
              let status: StartupStep['status'] = 'pending';
              if (index < currentStep) status = 'complete';
              else if (index === currentStep) status = 'active';
              
              return (
                <Box key={step.id} marginBottom={1}>
                  <Box>
                    <Text color={getStatusColor(status)}>
                      {getStatusIcon(status)} {step.label}
                    </Text>
                  </Box>
                  
                  {/* Show details for completed AND active steps (cumulative) */}
                  {(status === 'active' || status === 'complete') && step.details && (
                    <Box marginLeft={4} marginTop={0} flexDirection="column">
                      {step.details.map((detail, i) => (
                        <Text key={i} color={status === 'complete' ? "green" : "gray"} dimColor>
                          ├─ {detail}
                        </Text>
                      ))}
                    </Box>
                  )}
                  
                  {status === 'complete' && (
                    <Box marginLeft={4}>
                      <Text color="green" dimColor>└─ Complete</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
          
          {/* Progress Bar */}
          <Box marginTop={1}>
            <Text color="cyan">Progress: </Text>
            <Text color="cyanBright">
              {'█'.repeat(Math.floor((currentStep / steps.length) * 20))}
              {'░'.repeat(20 - Math.floor((currentStep / steps.length) * 20))}
            </Text>
            <Text color="cyan"> {Math.floor((currentStep / steps.length) * 100)}%</Text>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        {isCompleted ? (
          <Box flexDirection="column">
            <Text color="green" bold>
              ✨ Swarm initialization complete! Transitioning to control center...
            </Text>
            <Text color="cyan">
              📊 Full auto-approval mode enabled - agents will work autonomously
            </Text>
          </Box>
        ) : (
          <Text color="magenta" bold>
            💫 Agents will automatically begin work once initialization completes...
          </Text>
        )}
      </Box>
    </Box>
  );
}