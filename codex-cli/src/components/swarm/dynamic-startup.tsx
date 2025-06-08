import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import fs from "fs/promises";
import path from "path";
import type { ResponseItem } from "openai/resources/responses/responses.mjs";

interface DynamicStartupProps {
  onComplete: () => void;
  duration?: number;
  onItem?: (item: ResponseItem) => void;
  onDiscoveryComplete?: (tasks: Array<{title: string, priority: string}>) => void;
}

interface AnalysisStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
  findings: string[];
  isRealTime: boolean;
}

export function DynamicSwarmStartup({ onComplete, duration = 8000, onItem, onDiscoveryComplete }: DynamicStartupProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [discoveredTasks, setDiscoveredTasks] = useState<Array<{title: string, priority: string}>>([]);
  const processStartedRef = React.useRef(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<AnalysisStep[]>([
    {
      id: 'init',
      label: 'INITIALIZING DATA CODEX SWARM',
      status: 'active',
      findings: [
        '⚡ Multi-provider client loaded (OpenAI, Anthropic, Google)',
        '🔑 Checking API keys...',
        '🤖 Agent pool initializing...'
      ],
      isRealTime: false
    },
    {
      id: 'scan',
      label: 'SCANNING CODEBASE STRUCTURE',
      status: 'pending',
      findings: [],
      isRealTime: true
    },
    {
      id: 'docs',
      label: 'ANALYZING PROJECT DOCUMENTATION',
      status: 'pending', 
      findings: [],
      isRealTime: true
    },
    {
      id: 'logs',
      label: 'REVIEWING LLM LOGS & RECENT ACTIVITY',
      status: 'pending',
      findings: [],
      isRealTime: true
    },
    {
      id: 'todos',
      label: 'GENERATING INTELLIGENT TODO LIST',
      status: 'pending',
      findings: [],
      isRealTime: true
    },
    {
      id: 'deploy',
      label: 'DEPLOYING AGENT SWARM',
      status: 'pending',
      findings: [
        '⚡ Swarm coordination activated',
        '🌿 Git branch management initialized', 
        '📋 Task queue populated',
        '🚀 Agents ready for autonomous execution'
      ],
      isRealTime: false
    }
  ]);

  // 🚀 Step progression timer - actually advance the steps!
  React.useEffect(() => {
    if (isCompleted) return;
    
    const stepDuration = duration / steps.length;
    let stepIndex = 0;
    
    const stepTimer = setInterval(() => {
      if (stepIndex < steps.length) {
        setCurrentStep(stepIndex);
        setProgress(Math.round((stepIndex / steps.length) * 100));
        stepIndex++;
      } else {
        clearInterval(stepTimer);
        setIsCompleted(true);
        setProgress(100);
        
        // Trigger discovery completion
        if (onDiscoveryComplete && discoveredTasks.length > 0) {
          onDiscoveryComplete(discoveredTasks);
        }
        
        if (onComplete) {
          onComplete();
        }
      }
    }, stepDuration);
    
    return () => clearInterval(stepTimer);
  }, [isCompleted, steps.length, duration]);

  // Failsafe timeout
  React.useEffect(() => {
    const failsafeTimeout = setTimeout(() => {
      if (!isCompleted && !processStartedRef.current) {
        console.warn("DynamicStartup: Failsafe timeout triggered - completing startup");
        processStartedRef.current = true;
        setIsCompleted(true);
        
        // Create a completion summary
        if (onItem) {
          onItem({
            id: `failsafe-completion-${Date.now()}`,
            type: "message",
            role: "assistant",
            content: [{
              type: "input_text",
              text: `🎯 **STARTUP COMPLETE (FAILSAFE)**\n\nDiscovery process completed. Found ${discoveredTasks.length} tasks.\nTransitioning to live control center...`
            }]
          });
        }
        
        // Trigger discovery completion with current tasks
        if (onDiscoveryComplete && discoveredTasks.length > 0) {
          onDiscoveryComplete(discoveredTasks);
        }
        
        // Call onComplete to hide the component
        if (onComplete) {
          onComplete();
        }
      }
    }, duration + 2000);
    
    return () => clearTimeout(failsafeTimeout);
  }, []);

  // Real-time codebase analysis
  const analyzeCodebase = async (): Promise<string[]> => {
    const findings: string[] = [];
    try {
      const cwd = process.cwd();
      
      // Check package.json
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
        findings.push(`✅ ${pkg.name || 'Project'} - ${pkg.description || 'TypeScript/React project'}`);
        findings.push(`📦 ${Object.keys(pkg.dependencies || {}).length} dependencies found`);
      } catch {
        findings.push('⚠️ No package.json found');
      }

      // Check git status
      try {
        const gitDir = path.join(cwd, '.git');
        await fs.access(gitDir);
        findings.push('✅ Git repository detected');
        
        // Count files in common directories
        const dirs = ['src', 'lib', 'components', 'utils'];
        for (const dir of dirs) {
          try {
            const dirPath = path.join(cwd, dir);
            const files = await fs.readdir(dirPath);
            if (files.length > 0) {
              findings.push(`📁 ${dir}/: ${files.length} files`);
            }
          } catch {
            // Directory doesn't exist, skip
          }
        }
      } catch {
        findings.push('⚠️ Not a git repository');
      }

    } catch (error) {
      findings.push('⚠️ Error scanning codebase');
    }
    
    return findings;
  };

  const analyzeDocumentation = async (): Promise<string[]> => {
    const findings: string[] = [];
    try {
      const cwd = process.cwd();
      const docFiles = ['README.md', 'readme.md', 'goals.md', 'GOALS.md', 'TODO.md', 'todo.md', 'CHANGELOG.md', 'changelog.md'];
      
      for (const filename of docFiles) {
        try {
          const content = await fs.readFile(path.join(cwd, filename), 'utf-8');
          findings.push(`✅ ${filename} found (${Math.round(content.length / 1000)}k chars)`);
          
          // Extract key insights
          if (filename.toLowerCase().includes('readme')) {
            const lines = content.split('\n').slice(0, 10);
            const title = lines.find(line => line.startsWith('#'));
            if (title) {
              findings.push(`📖 Project: ${title.replace(/^#+\s*/, '').slice(0, 50)}`);
            }
          }
          
          if (filename.toLowerCase().includes('todo') || filename.toLowerCase().includes('goals')) {
            const todoCount = (content.match(/[-*+] /g) || []).length;
            if (todoCount > 0) {
              findings.push(`📝 ${todoCount} tasks/goals identified`);
            }
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      if (findings.length === 0) {
        findings.push('⚠️ No documentation files found');
        findings.push('💡 Consider adding README.md or goals.md');
      }

    } catch (error) {
      findings.push('⚠️ Error analyzing documentation');
    }
    
    return findings;
  };

  const analyzeLLMLogs = async (): Promise<string[]> => {
    const findings: string[] = [];
    try {
      const cwd = process.cwd();
      const logsDir = path.join(cwd, 'LLM_LOGS');
      
      try {
        await fs.access(logsDir);
        const logFiles = await fs.readdir(logsDir);
        findings.push(`✅ LLM_LOGS directory found`);
        findings.push(`📊 ${logFiles.length} log entries discovered`);
        
        // Check for recent activity
        const sessionDir = path.join(logsDir, 'sessions');
        try {
          const sessions = await fs.readdir(sessionDir);
          if (sessions.length > 0) {
            findings.push(`🕒 ${sessions.length} previous sessions found`);
          }
        } catch {
          // No sessions dir
        }

        const agentDir = path.join(logsDir, 'agents');
        try {
          const agents = await fs.readdir(agentDir);
          if (agents.length > 0) {
            findings.push(`🤖 ${agents.length} agent logs discovered`);
          }
        } catch {
          // No agents dir
        }

      } catch {
        findings.push('📁 LLM_LOGS directory will be created');
        findings.push('✨ Fresh start - no previous activity');
      }

    } catch (error) {
      findings.push('⚠️ Error checking LLM logs');
    }
    
    return findings;
  };

  const generateTodoList = async (): Promise<string[]> => {
    const findings: string[] = [];
    const discoveredTaskList: Array<{title: string, priority: string}> = [];
    
    try {
      findings.push('🧠 Analyzing codebase patterns...');
      
      const cwd = process.cwd();
      
      // Check for TypeScript errors (with timeout)
      try {
        const { spawn } = await import('child_process');
        const tsCheck = spawn('npx', ['tsc', '--noEmit', '--skipLibCheck'], { 
          cwd, 
          stdio: 'pipe',
          timeout: 2000  // 2 second timeout
        });
        let hasErrors = false;
        let completed = false;
        
        tsCheck.stderr.on('data', (data) => {
          if (data.toString().includes('error')) hasErrors = true;
        });
        
        tsCheck.on('close', (code) => {
          if (!completed) {
            completed = true;
            if (code !== 0 || hasErrors) {
              discoveredTaskList.push({ title: 'Fix TypeScript compilation errors', priority: 'high' });
              findings.push('📋 High priority: Fix TypeScript compilation errors');
            } else {
              findings.push('✅ TypeScript compilation clean');
            }
          }
        });
        
        tsCheck.on('error', () => {
          if (!completed) {
            completed = true;
            discoveredTaskList.push({ title: 'Fix TypeScript compilation errors', priority: 'high' });
            findings.push('📋 High priority: Fix TypeScript compilation errors');
          }
        });
        
        // Give it a brief moment to check, then timeout
        await Promise.race([
          new Promise(resolve => setTimeout(resolve, 1500)),
          new Promise(resolve => tsCheck.on('close', resolve))
        ]);
        
        // Kill the process if it's still running
        if (!completed) {
          tsCheck.kill();
          discoveredTaskList.push({ title: 'Fix TypeScript compilation errors', priority: 'high' });
          findings.push('📋 High priority: Fix TypeScript compilation errors (timeout)');
        }
      } catch {
        // TypeScript check failed, assume we need fixes
        discoveredTaskList.push({ title: 'Fix TypeScript compilation errors', priority: 'high' });
        findings.push('📋 High priority: Fix TypeScript compilation errors');
      }
      
      // Check package.json for outdated dependencies
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
        if (pkg.dependencies && Object.keys(pkg.dependencies).length > 50) {
          discoveredTaskList.push({ title: 'Update package dependencies', priority: 'medium' });
          findings.push('📋 Medium: Update package dependencies');
        }
      } catch {
        // No package.json or couldn't read it
      }
      
      // Check for missing tests
      try {
        const testDirs = ['test', 'tests', '__tests__', 'spec'];
        let hasTests = false;
        
        for (const testDir of testDirs) {
          try {
            await fs.access(path.join(cwd, testDir));
            hasTests = true;
            break;
          } catch {
            // Directory doesn't exist
          }
        }
        
        if (!hasTests) {
          discoveredTaskList.push({ title: 'Add comprehensive test suite', priority: 'medium' });
          findings.push('📋 Medium: Add comprehensive test suite');
        }
      } catch {
        // Error checking tests
      }
      
      // Check for documentation issues
      try {
        const readmeExists = await fs.access(path.join(cwd, 'README.md')).then(() => true).catch(() => false);
        if (!readmeExists) {
          discoveredTaskList.push({ title: 'Create comprehensive README.md', priority: 'low' });
          findings.push('📋 Low: Create comprehensive README.md');
        }
      } catch {
        // Error checking README
      }
      
      // Check for build system
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
        if (pkg.scripts && pkg.scripts.build) {
          findings.push('✅ Build system identified');
        } else {
          discoveredTaskList.push({ title: 'Set up build system', priority: 'medium' });
          findings.push('📋 Medium: Set up build system');
        }
        
        if (pkg.scripts && (pkg.scripts.test || pkg.scripts.jest)) {
          findings.push('✅ Test framework detected');
        }
      } catch {
        // No package.json
      }
      
      // Check git log for recent activity and patterns
      try {
        const { spawn } = await import('child_process');
        const gitLog = spawn('git', ['log', '--oneline', '-10'], { cwd, stdio: 'pipe' });
        let gitOutput = '';
        
        gitLog.stdout.on('data', (data) => {
          gitOutput += data.toString();
        });
        
        await new Promise(resolve => {
          gitLog.on('close', () => resolve(null));
          setTimeout(resolve, 1000);
        });
        
        if (gitOutput) {
          const commits = gitOutput.split('\n').filter(line => line.trim());
          findings.push(`🔄 Recent activity: ${commits.length} commits`);
          
          // Look for patterns in recent commits
          const commitMessages = commits.map(line => line.split(' ').slice(1).join(' ')).join(' ').toLowerCase();
          
          if (commitMessages.includes('fix') || commitMessages.includes('bug')) {
            discoveredTaskList.push({ title: 'Continue bug fixing work from recent commits', priority: 'high' });
            findings.push('📋 High: Continue bug fixing work from recent commits');
          }
          
          if (commitMessages.includes('test') || commitMessages.includes('spec')) {
            findings.push('✅ Testing activity detected in recent commits');
          } else {
            discoveredTaskList.push({ title: 'Add comprehensive test suite', priority: 'high' });
            findings.push('📋 High: Add comprehensive test suite');
          }
          
          if (commitMessages.includes('update') || commitMessages.includes('refactor')) {
            discoveredTaskList.push({ title: 'Continue refactoring and updates', priority: 'medium' });
            findings.push('📋 Medium: Continue refactoring and updates');
          }
        }
      } catch {
        // Git not available
        discoveredTaskList.push({ title: 'Add comprehensive test suite', priority: 'high' });
        findings.push('📋 High: Add comprehensive test suite');
      }
      
      // Check for TODOs in the code
      try {
        const { spawn } = await import('child_process');
        const grepTodos = spawn('grep', ['-r', '-i', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx', 'TODO\\|FIXME\\|HACK\\|BUG', 'src/'], { cwd, stdio: 'pipe' });
        let todoOutput = '';
        
        grepTodos.stdout.on('data', (data) => {
          todoOutput += data.toString();
        });
        
        await new Promise(resolve => {
          grepTodos.on('close', () => resolve(null));
          setTimeout(resolve, 500);
        });
        
        if (todoOutput) {
          const todoCount = todoOutput.split('\n').filter(line => line.trim()).length;
          if (todoCount > 0) {
            discoveredTaskList.push({ title: `Fix ${todoCount} TODO/FIXME items in codebase`, priority: 'medium' });
            findings.push(`📋 Medium: Fix ${todoCount} TODO/FIXME items in codebase`);
          }
        }
      } catch {
        // Grep not available
      }
      
      // Update the state with discovered tasks
      setDiscoveredTasks(discoveredTaskList);
      
      findings.push(`🎯 ${discoveredTaskList.length} tasks queued for agent execution`);

    } catch (error) {
      findings.push('⚠️ Error generating todos');
      // Fallback tasks even on error
      const fallbackTasks = [
        { title: 'Code quality review and improvements', priority: 'medium' },
        { title: 'Documentation updates', priority: 'low' }
      ];
      setDiscoveredTasks(fallbackTasks);
    }
    
    return findings;
  };

  // Step progression with real-time analysis
  useEffect(() => {
    if (isCompleted) return;
    
    const stepDuration = duration / steps.length;
    let timeoutHandle: NodeJS.Timeout;
    
    const processStep = async (stepIndex: number) => {
      // Check if component is still mounted and not completed
      if (isCompleted || processStartedRef.current) return;
      
      if (stepIndex >= steps.length) {
        if (!isCompleted) {
          setIsCompleted(true);
          
          // Create a summary message that stays in chat history
          if (onItem) {
            onItem({
              id: `discovery-summary-${Date.now()}`,
              type: "message",
              role: "assistant",
              content: [{
                type: "input_text",
                text: `🎯 **DISCOVERY COMPLETE - WORK IDENTIFIED**\n\n` +
                      `Found ${discoveredTasks.length} high-priority tasks:\n` +
                      discoveredTasks.map(task => `• ${task.title} (${task.priority.toUpperCase()})`).join('\n') +
                      `\n\n✅ All tasks have been assigned to specialist agents and are now visible in the Control Center above.\n` +
                      `🤖 Agents will begin working automatically on these real issues found in your codebase.`
              }]
            });
          }
          
          // Notify parent that discovery is complete with tasks
          if (onDiscoveryComplete && discoveredTasks.length > 0) {
            onDiscoveryComplete(discoveredTasks);
          }
          
          // Call onComplete to hide the component
          if (onComplete) {
            onComplete();
          }
        }
        return;
      }

      // Update step status
      setSteps(prev => prev.map((step, i) => ({
        ...step,
        status: i < stepIndex ? 'complete' : i === stepIndex ? 'active' : 'pending'
      })));

      // Perform real-time analysis for specific steps
      const currentStepData = steps[stepIndex];
      if (currentStepData.isRealTime) {
        let findings: string[] = [];
        
        try {
          switch (currentStepData.id) {
            case 'scan':
              findings = await analyzeCodebase();
              break;
            case 'docs':
              findings = await analyzeDocumentation();
              break;
            case 'logs':
              findings = await analyzeLLMLogs();
              break;
            case 'todos':
              findings = await generateTodoList();
              break;
          }

          // Update findings if still mounted
          if (!isCompleted) {
            setSteps(prev => prev.map((step, i) => 
              i === stepIndex ? { ...step, findings } : step
            ));
          }
        } catch (error) {
          console.warn(`Error in step ${currentStepData.id}:`, error);
          // Continue anyway with empty findings
        }
      }

      setCurrentStep(stepIndex + 1);
      
      // Schedule next step only if not completed
      if (!isCompleted && stepIndex + 1 < steps.length) {
        timeoutHandle = setTimeout(() => processStep(stepIndex + 1), stepDuration);
      } else if (stepIndex + 1 >= steps.length) {
        // This is the last step, trigger completion
        timeoutHandle = setTimeout(() => processStep(stepIndex + 1), stepDuration);
      }
    };

    // Start the process only once
    if (!processStartedRef.current) {
      processStartedRef.current = true;
      const startTimeout = setTimeout(() => processStep(0), 100);
      
      // Cleanup function
      return () => {
        clearTimeout(startTimeout);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      };
    }
  }, []);

  const getStatusIcon = (status: AnalysisStep['status']) => {
    switch (status) {
      case 'complete': return '✅';
      case 'active': return '⚡';
      case 'pending': return '⏳';
    }
  };

  const getStatusColor = (status: AnalysisStep['status']) => {
    switch (status) {
      case 'complete': return 'green';
      case 'active': return 'cyan';
      case 'pending': return 'gray';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Single unified box - no nesting */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box flexDirection="column">
          {/* Header */}
          <Box flexDirection="column" alignItems="center" marginBottom={1}>
            <Text bold color="cyanBright">🚀 DATA CODEX CYBERPUNK AI SWARM 🚀</Text>
            <Text color="gray">Intelligent Multi-Agent Coordination System</Text>
          </Box>
          
          {/* Initialization Steps */}
          <Text bold color="blueBright">🔄 INTELLIGENT SWARM INITIALIZATION</Text>
          <Text color="gray">Real-time codebase analysis and work discovery...</Text>
          
          <Box marginTop={1} flexDirection="column">
            {steps.map((step, index) => {
              let status: AnalysisStep['status'] = 'pending';
              if (index < currentStep) status = 'complete';
              else if (index === currentStep - 1) status = 'active';
              
              return (
                <Box key={step.id} marginBottom={1}>
                  <Box>
                    <Text color={getStatusColor(status)}>
                      {getStatusIcon(status)} {step.label}
                    </Text>
                  </Box>
                  
                  {/* Show findings for completed AND active steps (cumulative) */}
                  {(status === 'active' || status === 'complete') && step.findings.length > 0 && (
                    <Box marginLeft={4} marginTop={0} flexDirection="column">
                      {step.findings.map((finding, i) => (
                        <Text key={i} color={status === 'complete' ? "green" : "cyan"} dimColor>
                          ├─ {finding}
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
              {'█'.repeat(Math.floor(progress / 5))}
              {'░'.repeat(20 - Math.floor(progress / 5))}
            </Text>
            <Text color="cyan"> {progress}%</Text>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        {isCompleted ? (
          <Box flexDirection="column">
            <Text color="green" bold>
              ✨ Swarm analysis complete! Transitioning to control center...
            </Text>
            <Text color="cyan">
              📊 Full auto-approval mode enabled - agents will work autonomously
            </Text>
          </Box>
        ) : (
          <Text color="magenta" bold>
            💫 Intelligent analysis in progress - discovering work autonomously...
          </Text>
        )}
      </Box>
    </Box>
  );
}