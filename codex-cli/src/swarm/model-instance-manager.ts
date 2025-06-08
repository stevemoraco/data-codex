import type { AppConfig } from "../utils/config.js";
import type { AgentTask } from "./swarm-coordinator.js";

import { log } from "../utils/logger/log.js";

export interface ModelInstance {
  id: string;
  modelName: string;
  instanceNumber: number;
  status: 'idle' | 'working' | 'rate-limited' | 'error';
  currentTask?: string;
  rateLimitUntil?: Date;
  totalRequests: number;
  successfulRequests: number;
  totalCost: number;
  lastUsed?: Date;
  createdAt: Date;
}

export interface ModelPerformance {
  modelName: string;
  taskType: string;
  successRate: number;
  averageTime: number;
  costPerTask: number;
  totalTasks: number;
  lastUpdated: Date;
}

export class ModelInstanceManager {
  private instances: Map<string, ModelInstance[]> = new Map();
  private performance: Map<string, ModelPerformance> = new Map();
  private rateLimitBackoff: Map<string, number> = new Map();

  // Cost tier mapping (cheapest to most expensive) - updated to use function-calling compatible models
  private readonly MODEL_TIERS = {
    tier1: ['gpt-4.1', 'gpt-4.1-mini'],                 // Fast & reliable, supports function calling  
    tier2: ['claude-sonnet-4-20250514', 'gemini-2.5-pro-preview-06-05'], // High quality, long context
    tier3: ['o3', 'o4-mini']                            // Most capable, expensive
  };

  // Models that support function calling (exclude chatgpt-4o-latest and codex-mini-latest)
  private readonly FUNCTION_CALLING_MODELS = new Set([
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4', 'o3', 'o4-mini',
    'claude-sonnet-4-20250514', 'gemini-2.5-pro-preview-06-05'
  ]);

  constructor(_config: AppConfig) {
    // Config not currently used but preserved for future expansion
  }

  public async scaleToTargets(preferredModels: string[], maxTotal: number): Promise<void> {
    log(`Scaling to ${maxTotal} total instances across models: ${preferredModels.join(', ')}`);
    
    // Calculate target instances per model
    const instancesPerModel = Math.ceil(maxTotal / preferredModels.length);
    
    for (const modelName of preferredModels) {
      await this.scaleModel(modelName, instancesPerModel);
    }
  }

  public async scaleModel(modelName: string, targetInstances: number): Promise<void> {
    const currentInstances = this.instances.get(modelName) || [];
    const currentCount = currentInstances.length;

    if (currentCount < targetInstances) {
      // Scale up
      for (let i = currentCount; i < targetInstances; i++) {
        await this.createInstance(modelName, i + 1);
      }
      log(`Scaled up ${modelName} from ${currentCount} to ${targetInstances} instances`);
    } else if (currentCount > targetInstances) {
      // Scale down
      const instancesToRemove = currentCount - targetInstances;
      const instances = this.instances.get(modelName) || [];
      
      // Remove idle instances first
      const idleInstances = instances.filter(inst => inst.status === 'idle');
      const toRemove = idleInstances.slice(0, instancesToRemove);
      
      for (const instance of toRemove) {
        await this.terminateInstance(modelName, instance.id);
      }
      log(`Scaled down ${modelName} from ${currentCount} to ${targetInstances} instances`);
    }
  }

  private async createInstance(modelName: string, instanceNumber: number): Promise<ModelInstance> {
    const instanceId = `${modelName}-instance-${instanceNumber}`;
    
    const instance: ModelInstance = {
      id: instanceId,
      modelName,
      instanceNumber,
      status: 'idle',
      totalRequests: 0,
      successfulRequests: 0,
      totalCost: 0,
      createdAt: new Date()
    };

    if (!this.instances.has(modelName)) {
      this.instances.set(modelName, []);
    }
    
    this.instances.get(modelName)!.push(instance);
    
    log(`Created instance ${instanceId}`);
    return instance;
  }

  private async terminateInstance(modelName: string, instanceId: string): Promise<void> {
    const instances = this.instances.get(modelName) || [];
    const index = instances.findIndex(inst => inst.id === instanceId);
    
    if (index !== -1) {
      instances.splice(index, 1);
      log(`Terminated instance ${instanceId}`);
    }
  }

  public async selectModelForTask(task: AgentTask): Promise<string | null> {
    // Try to find the best model based on performance history
    const performanceHistory = Array.from(this.performance.values())
      .filter(perf => perf.taskType === task.type)
      .sort((a, b) => {
        // Sort by success rate first, then by cost efficiency
        if (Math.abs(a.successRate - b.successRate) > 5) {
          return b.successRate - a.successRate;
        }
        return a.costPerTask - b.costPerTask;
      });

    // If we have performance history, prefer top performers
    if (performanceHistory.length > 0) {
      const topPerformer = performanceHistory[0];
      if (topPerformer) {
        const availableInstance = this.getAvailableInstance(topPerformer.modelName);
        if (availableInstance) {
          return this.assignInstance(availableInstance, task.id);
        }
      }
    }

    // Fallback to cost-optimized selection (start with cheapest)
    for (const tier of [this.MODEL_TIERS.tier1, this.MODEL_TIERS.tier2, this.MODEL_TIERS.tier3]) {
      for (const modelName of tier) {
        const availableInstance = this.getAvailableInstance(modelName);
        if (availableInstance) {
          return this.assignInstance(availableInstance, task.id);
        }
      }
    }

    // If no instances available, try to create one from tier1 (cheapest)
    for (const modelName of this.MODEL_TIERS.tier1) {
      if (this.canCreateInstance(modelName)) {
        const instance = await this.createInstance(modelName, 1);
        return this.assignInstance(instance, task.id);
      }
    }

    return null; // No capacity available
  }

  private getAvailableInstance(modelName: string): ModelInstance | null {
    const instances = this.instances.get(modelName) || [];
    
    // Filter out rate-limited instances
    const availableInstances = instances.filter(inst => {
      if (inst.status !== 'idle') return false;
      if (inst.rateLimitUntil && inst.rateLimitUntil > new Date()) return false;
      return true;
    });

    if (availableInstances.length === 0) return null;

    // Return least recently used instance
    const sorted = availableInstances.sort((a, b) => {
      const aTime = a.lastUsed?.getTime() || 0;
      const bTime = b.lastUsed?.getTime() || 0;
      return aTime - bTime;
    });
    
    return sorted[0] || null;
  }

  private assignInstance(instance: ModelInstance, taskId: string): string {
    instance.status = 'working';
    instance.currentTask = taskId;
    instance.lastUsed = new Date();
    instance.totalRequests++;
    
    log(`Assigned instance ${instance.id} to task ${taskId}`);
    return instance.modelName;
  }

  public async releaseInstance(modelName: string, taskId: string, success: boolean, cost: number = 0): Promise<void> {
    const instances = this.instances.get(modelName) || [];
    const instance = instances.find(inst => inst.currentTask === taskId);
    
    if (!instance) return;

    instance.status = 'idle';
    instance.currentTask = undefined;
    instance.totalCost += cost;
    
    if (success) {
      instance.successfulRequests++;
    }

    log(`Released instance ${instance.id} from task ${taskId}, success: ${success}`);
  }

  public async handleRateLimit(modelName: string, instanceId: string, retryAfter?: number): Promise<void> {
    const instances = this.instances.get(modelName) || [];
    const instance = instances.find(inst => inst.id === instanceId);
    
    if (!instance) return;

    instance.status = 'rate-limited';
    
    // Set rate limit backoff
    const backoffMs = retryAfter ? retryAfter * 1000 : this.calculateBackoff(modelName);
    instance.rateLimitUntil = new Date(Date.now() + backoffMs);
    
    log(`Instance ${instanceId} rate limited until ${instance.rateLimitUntil}`);
  }

  private calculateBackoff(modelName: string): number {
    const currentBackoff = this.rateLimitBackoff.get(modelName) || 1000; // 1 second default
    const newBackoff = Math.min(currentBackoff * 2, 60000); // Max 1 minute
    this.rateLimitBackoff.set(modelName, newBackoff);
    return newBackoff;
  }

  private canCreateInstance(modelName: string): boolean {
    const instances = this.instances.get(modelName) || [];
    const maxInstancesPerModel = 5; // Configurable limit
    return instances.length < maxInstancesPerModel;
  }

  public updatePerformance(
    modelName: string, 
    taskType: string, 
    success: boolean, 
    durationMs: number, 
    cost: number
  ): void {
    const key = `${modelName}-${taskType}`;
    let perf = this.performance.get(key);
    
    if (!perf) {
      perf = {
        modelName,
        taskType,
        successRate: 0,
        averageTime: 0,
        costPerTask: 0,
        totalTasks: 0,
        lastUpdated: new Date()
      };
    }

    // Update metrics using moving averages
    const totalTasks = perf.totalTasks + 1;
    const successCount = (perf.successRate / 100) * perf.totalTasks + (success ? 1 : 0);
    
    perf.successRate = (successCount / totalTasks) * 100;
    perf.averageTime = (perf.averageTime * perf.totalTasks + durationMs) / totalTasks;
    perf.costPerTask = (perf.costPerTask * perf.totalTasks + cost) / totalTasks;
    perf.totalTasks = totalTasks;
    perf.lastUpdated = new Date();
    
    this.performance.set(key, perf);
    
    log(`Updated performance for ${modelName}-${taskType}: ${perf.successRate.toFixed(1)}% success, $${perf.costPerTask.toFixed(4)}/task`);
  }

  public getInstanceStats(): { [modelName: string]: { total: number; active: number; idle: number; rateLimited: number } } {
    const stats: { [modelName: string]: { total: number; active: number; idle: number; rateLimited: number } } = {};
    
    for (const [modelName, instances] of this.instances) {
      stats[modelName] = {
        total: instances.length,
        active: instances.filter(i => i.status === 'working').length,
        idle: instances.filter(i => i.status === 'idle').length,
        rateLimited: instances.filter(i => i.status === 'rate-limited').length
      };
    }
    
    return stats;
  }

  public getAllInstances(): ModelInstance[] {
    const allInstances: ModelInstance[] = [];
    for (const instances of this.instances.values()) {
      allInstances.push(...instances);
    }
    return allInstances;
  }

  public getPerformanceHistory(): ModelPerformance[] {
    return Array.from(this.performance.values());
  }
}