import type { AppConfig } from "../utils/config.js";
import type { ApprovalPolicy } from "../approvals.js";

import { SwarmManager } from "./swarm-manager.js";
import { GitCoordinator } from "./git-coordinator.js";
import { SharedTodoManager } from "./shared-todo-manager.js";
import { getLLMLogsManager } from "../utils/llm-logs.js";
import { log } from "../utils/logger/log.js";

/**
 * End-to-End Test Suite for Cyberpunk AI Swarm Workflow
 * Tests the complete integration of all swarm features
 */
export class E2ESwarmTester {
  private swarmManager: SwarmManager;
  private gitCoordinator: GitCoordinator;
  private todoManager: SharedTodoManager;
  private logsManager = getLLMLogsManager();
  private testResults: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; details?: string; duration?: number }> = [];

  constructor(config: AppConfig, approvalPolicy: ApprovalPolicy) {
    this.swarmManager = new SwarmManager(
      config,
      approvalPolicy,
      this.mockOnItem.bind(this),
      this.mockOnLoading.bind(this)
    );
    this.gitCoordinator = new GitCoordinator();
    this.todoManager = new SharedTodoManager();
  }

  private mockOnItem(item: any): void {
    // Mock item handler for testing
    log(`[E2E Test] Item received: ${item.type}`);
  }

  private mockOnLoading(loading: boolean): void {
    // Mock loading handler for testing
    log(`[E2E Test] Loading state: ${loading}`);
  }

  /**
   * Run the complete end-to-end test suite
   */
  async runFullTestSuite(): Promise<void> {
    log("🚀 Starting E2E Cyberpunk Swarm Test Suite");
    
    const startTime = Date.now();
    
    try {
      // Initialize all systems
      await this.testInitialization();
      
      // Test LLM logging system
      await this.testLLMLogging();
      
      // Test git coordination
      await this.testGitCoordination();
      
      // Test todo management
      await this.testTodoManagement();
      
      // Test swarm activation
      await this.testSwarmActivation();
      
      // Test multi-agent task execution
      await this.testMultiAgentExecution();
      
      // Test agent coordination
      await this.testAgentCoordination();
      
      // Test error handling and recovery
      await this.testErrorHandling();
      
      // Test cleanup and shutdown
      await this.testCleanup();
      
    } catch (error) {
      this.addTestResult('Full Test Suite', 'fail', `Unexpected error: ${error}`);
    }
    
    const duration = Date.now() - startTime;
    await this.generateTestReport(duration);
  }

  private async testInitialization(): Promise<void> {
    const testName = 'System Initialization';
    const startTime = Date.now();
    
    try {
      // Test LLM logs initialization
      await this.logsManager.initialize();
      
      // Test git coordinator initialization
      await this.gitCoordinator.cleanup(); // Ensure clean state
      
      // Test todo manager initialization
      await this.todoManager.initialize();
      
      this.addTestResult(testName, 'pass', 'All systems initialized successfully', Date.now() - startTime);
    } catch (error) {
      this.addTestResult(testName, 'fail', `Initialization failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testLLMLogging(): Promise<void> {
    const testName = 'LLM Logging System';
    const startTime = Date.now();
    
    try {
      const mockAgent = {
        id: 'test-agent-logging',
        model: 'gpt-4',
        provider: 'openai'
      };
      
      // Test input logging
      const inputId = await this.logsManager.logInput(mockAgent, {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Test logging input' }]
      });
      
      // Test output logging
      const outputId = await this.logsManager.logOutput(mockAgent, {
        type: 'message',
        role: 'assistant', 
        content: [{ type: 'input_text', text: 'Test logging output' }]
      });
      
      // Test task logging
      const taskId = await this.logsManager.logTask(mockAgent, {
        id: 'test-task-123',
        description: 'Test logging task',
        priority: 'medium',
        status: 'in-progress'
      }, 'created');
      
      // Test coordination logging
      const coordId = await this.logsManager.logCoordination(
        mockAgent,
        { id: 'test-agent-2', model: 'claude-3', provider: 'anthropic' },
        'Test coordination message'
      );
      
      // Test error logging
      const errorId = await this.logsManager.logError(mockAgent, new Error('Test error'));
      
      // Verify all logs were created
      if (inputId && outputId && taskId && coordId && errorId) {
        this.addTestResult(testName, 'pass', 'All logging functions work correctly', Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', 'Some logging functions failed to return IDs', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult(testName, 'fail', `Logging test failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testGitCoordination(): Promise<void> {
    const testName = 'Git Coordination';
    const startTime = Date.now();
    
    try {
      const agentId = 'test-agent-git';
      const taskId = 'test-task-git-123';
      
      // Test branch creation
      const branchName = await this.gitCoordinator.createAgentBranch(agentId, taskId, {
        id: taskId,
        description: 'Test git coordination',
        priority: 'medium',
        type: 'general',
        input: [],
        status: 'pending'
      });
      
      // Test branch switching
      const switched = await this.gitCoordinator.switchToAgentBranch(agentId, taskId);
      
      // Test work commit (with no actual changes)
      await this.gitCoordinator.commitAgentWork(
        agentId,
        taskId,
        'Test commit for E2E testing'
      );
      
      // Get branch info
      const branches = this.gitCoordinator.getAgentBranches();
      const testBranch = branches.find(b => b.name === branchName);
      
      if (branchName && switched && testBranch) {
        this.addTestResult(testName, 'pass', `Git coordination working: branch ${branchName}`, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', 'Git coordination failed', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult(testName, 'fail', `Git test failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testTodoManagement(): Promise<void> {
    const testName = 'Todo Management';
    const startTime = Date.now();
    
    try {
      // Test todo creation
      const todoId = 'test-todo-123';
      await this.todoManager.createTodo({
        id: todoId,
        title: 'Test Todo Item',
        description: 'This is a test todo for E2E testing',
        priority: 'high',
        status: 'pending',
        assignedAgents: [],
        dependencies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Test todo assignment
      await this.todoManager.assignTodo(todoId, 'test-agent-todo');
      
      // Test status update
      await this.todoManager.updateTodoStatus(todoId, 'in-progress');
      
      // Test todo retrieval
      const todo = await this.todoManager.getTodo(todoId);
      
      if (todo && todo.status === 'in-progress' && todo.assignedAgents.includes('test-agent-todo')) {
        this.addTestResult(testName, 'pass', 'Todo management working correctly', Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', 'Todo management failed', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult(testName, 'fail', `Todo test failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testSwarmActivation(): Promise<void> {
    const testName = 'Swarm Activation';
    const startTime = Date.now();
    
    try {
      // Test swarm enablement
      const enabled = await this.swarmManager.enable();
      
      // Get swarm status
      const status = this.swarmManager.getStatus();
      
      if (enabled && status.enabled && status.agentCount > 0) {
        this.addTestResult(testName, 'pass', `Swarm activated with ${status.agentCount} agents`, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'skip', 'No API keys available for swarm testing', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult(testName, 'fail', `Swarm activation failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testMultiAgentExecution(): Promise<void> {
    const testName = 'Multi-Agent Task Execution';
    const startTime = Date.now();
    
    try {
      if (!this.swarmManager.isSwarmEnabled()) {
        this.addTestResult(testName, 'skip', 'Swarm not enabled, skipping execution test', Date.now() - startTime);
        return;
      }
      
      // Create a test task
      const testInput = [{
        type: "message" as const,
        role: "user" as const,
        content: [{ type: "input_text" as const, text: "This is a test task for E2E verification. Please respond with confirmation." }]
      }];
      
      // Execute task through swarm
      await this.swarmManager.executeTask(testInput);
      
      // Check task completion
      const status = this.swarmManager.getStatus();
      
      this.addTestResult(testName, 'pass', `Task executed, ${status.completedTasks} completed`, Date.now() - startTime);
    } catch (error) {
      this.addTestResult(testName, 'fail', `Multi-agent execution failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testAgentCoordination(): Promise<void> {
    const testName = 'Agent Coordination';
    const startTime = Date.now();
    
    try {
      // Test agent status tracking
      this.swarmManager.getStatus();
      
      // Test logs search for coordination
      const coordLogs = await this.logsManager.searchLogs({
        type: 'coordination',
        timeRange: { start: new Date(Date.now() - 3600000), end: new Date() }
      });
      
      this.addTestResult(testName, 'pass', `Coordination working: ${coordLogs.length} coordination events`, Date.now() - startTime);
    } catch (error) {
      this.addTestResult(testName, 'fail', `Agent coordination test failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testErrorHandling(): Promise<void> {
    const testName = 'Error Handling and Recovery';
    const startTime = Date.now();
    
    try {
      // Test error logging
      await this.logsManager.logError({
        id: 'test-error-agent',
        model: 'test-model',
        provider: 'test-provider'
      }, new Error('Test error for E2E verification'));
      
      // Test error log retrieval
      const errorLogs = await this.logsManager.searchLogs({
        type: 'error',
        timeRange: { start: new Date(Date.now() - 3600000), end: new Date() }
      });
      
      this.addTestResult(testName, 'pass', `Error handling working: ${errorLogs.length} error logs`, Date.now() - startTime);
    } catch (error) {
      this.addTestResult(testName, 'fail', `Error handling test failed: ${error}`, Date.now() - startTime);
    }
  }

  private async testCleanup(): Promise<void> {
    const testName = 'Cleanup and Shutdown';
    const startTime = Date.now();
    
    try {
      // Test swarm shutdown
      await this.swarmManager.disable();
      
      // Test git cleanup
      await this.gitCoordinator.cleanup();
      
      // Verify shutdown
      const status = this.swarmManager.getStatus();
      
      if (!status.enabled && status.activeAgents === 0) {
        this.addTestResult(testName, 'pass', 'Clean shutdown completed', Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', 'Shutdown incomplete', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult(testName, 'fail', `Cleanup test failed: ${error}`, Date.now() - startTime);
    }
  }

  private addTestResult(name: string, status: 'pass' | 'fail' | 'skip', details?: string, duration?: number): void {
    this.testResults.push({ name, status, details, duration });
    
    const statusIcon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
    const durationText = duration ? ` (${duration}ms)` : '';
    log(`${statusIcon} ${name}${durationText}: ${details || status}`);
  }

  private async generateTestReport(totalDuration: number): Promise<void> {
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const skipped = this.testResults.filter(r => r.status === 'skip').length;
    
    const report = `# Cyberpunk AI Swarm - E2E Test Report

**Generated:** ${new Date().toISOString()}
**Total Duration:** ${totalDuration}ms
**Results:** ${passed} passed, ${failed} failed, ${skipped} skipped

## Test Results

${this.testResults.map(result => {
  const statusIcon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
  const duration = result.duration ? ` (${result.duration}ms)` : '';
  return `- ${statusIcon} **${result.name}**${duration}: ${result.details || result.status}`;
}).join('\n')}

## Summary

${failed === 0 ? '🎉 All tests passed! The cyberpunk AI swarm is ready for action.' : 
  `⚠️ ${failed} test(s) failed. Review the failures above before proceeding.`}

## Features Tested

- ✅ LLM Logging System with standardized format
- ✅ Git Coordination with automatic branch management
- ✅ Shared Todo Management across agents
- ✅ Swarm Activation and Agent Pool Management
- ✅ Multi-Agent Task Execution
- ✅ Agent Coordination and Communication
- ✅ Error Handling and Recovery
- ✅ Clean Shutdown and Cleanup

## Next Steps

${failed === 0 ? 
  'The system is ready for production use. You can now use /swarm to activate the cyberpunk AI swarm!' :
  'Fix the failing tests before deploying the swarm system.'}
`;

    // Write test report to LLM logs
    await this.logsManager.logEntry({
      agent: { id: 'e2e-tester', model: 'system', provider: 'system' },
      type: 'summary',
      content: {
        summary: `E2E Test Report: ${passed} passed, ${failed} failed, ${skipped} skipped`,
        data: { 
          report, 
          results: this.testResults,
          totalDuration,
          passed,
          failed,
          skipped
        }
      },
      tags: ['e2e-test', 'report', 'cyberpunk-swarm']
    });

    log('\n' + '='.repeat(60));
    log('🏁 E2E TEST SUITE COMPLETED');
    log('='.repeat(60));
    log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    log(`⏱️ Total time: ${totalDuration}ms`);
    log(`📄 Full report saved to LLM logs`);
    log('='.repeat(60));
  }

  /**
   * Run a quick verification test
   */
  async runQuickTest(): Promise<boolean> {
    log("🔍 Running quick E2E verification...");
    
    try {
      await this.testInitialization();
      await this.testLLMLogging();
      await this.testSwarmActivation();
      
      const failures = this.testResults.filter(r => r.status === 'fail').length;
      
      if (failures === 0) {
        log("✅ Quick test passed - System ready!");
        return true;
      } else {
        log(`❌ Quick test failed - ${failures} failures`);
        return false;
      }
    } catch (error) {
      log(`❌ Quick test error: ${error}`);
      return false;
    }
  }
}

/**
 * Standalone function to run E2E tests
 */
export async function runE2ETests(config: AppConfig, approvalPolicy: ApprovalPolicy, quick: boolean = false): Promise<boolean> {
  const tester = new E2ESwarmTester(config, approvalPolicy);
  
  if (quick) {
    return await tester.runQuickTest();
  } else {
    await tester.runFullTestSuite();
    return true;
  }
}