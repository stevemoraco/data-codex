import type { ResponseInputItem } from "openai/resources/responses/responses.mjs";
import { log } from "./logger/log.js";

export interface QueuedInput {
  id: string;
  input: ResponseInputItem[];
  timestamp: Date;
  priority?: 'low' | 'normal' | 'high';
}

export class InputQueue {
  private queue: QueuedInput[] = [];
  private isProcessing: boolean = false;
  private onProcess?: (input: QueuedInput) => Promise<void>;

  constructor(onProcess?: (input: QueuedInput) => Promise<void>) {
    this.onProcess = onProcess;
  }

  public enqueue(input: ResponseInputItem[], priority: 'low' | 'normal' | 'high' = 'normal'): string {
    const queuedInput: QueuedInput = {
      id: `input-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      input,
      timestamp: new Date(),
      priority
    };

    // Insert based on priority
    if (priority === 'high') {
      this.queue.unshift(queuedInput);
    } else if (priority === 'low') {
      this.queue.push(queuedInput);
    } else {
      // Normal priority - insert before low priority items
      const lowPriorityIndex = this.queue.findIndex(item => item.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.queue.splice(lowPriorityIndex, 0, queuedInput);
      } else {
        this.queue.push(queuedInput);
      }
    }

    log(`Input queued: ${queuedInput.id} (priority: ${priority}, queue size: ${this.queue.length})`);
    
    // Start processing if not already processing
    if (!this.isProcessing) {
      this.processNext();
    }

    return queuedInput.id;
  }

  public getQueueStatus(): {
    size: number;
    isProcessing: boolean;
    nextItem?: Pick<QueuedInput, 'id' | 'priority' | 'timestamp'>;
  } {
    return {
      size: this.queue.length,
      isProcessing: this.isProcessing,
      nextItem: this.queue[0] ? {
        id: this.queue[0].id,
        priority: this.queue[0].priority,
        timestamp: this.queue[0].timestamp
      } : undefined
    };
  }

  public async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const nextInput = this.queue.shift();
    
    if (nextInput && this.onProcess) {
      try {
        log(`Processing input: ${nextInput.id}`);
        await this.onProcess(nextInput);
        log(`Completed processing: ${nextInput.id}`);
      } catch (error) {
        log(`Error processing input ${nextInput.id}: ${error}`);
      }
    }

    this.isProcessing = false;

    // Process next item if any
    if (this.queue.length > 0) {
      // Small delay to prevent overwhelming
      setTimeout(() => this.processNext(), 100);
    }
  }

  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
    log("Input queue cleared");
  }

  public setProcessor(onProcess: (input: QueuedInput) => Promise<void>): void {
    this.onProcess = onProcess;
  }

  public getQueue(): QueuedInput[] {
    return [...this.queue]; // Return copy
  }
}