import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TaskDefinition,
  TaskExecutionContext,
  WorkflowExecutionResult,
  TaskLifecycleEventData,
} from './task.interface';
import { TaskLifecycleEvent, TaskStatus } from './events.enum';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async run(workflow: TaskDefinition[]): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const taskContexts = new Map<string, TaskExecutionContext>();
    const results = new Map<string, any>();
    const errors = new Map<string, Error>();

    // Initialize task contexts
    for (const task of workflow) {
      taskContexts.set(task.id, {
        id: task.id,
        status: TaskStatus.PENDING,
        attempts: 0,
        maxRetries: task.retries ?? 0,
        timeoutMs: task.timeoutMs ?? 2000,
        dependencies: task.dependencies ?? [],
        dependencyResults: new Map(),
      });
    }

    // Validate dependencies
    this.validateDependencies(workflow);

    // Execute workflow
    await this.executeWorkflow(workflow, taskContexts, results, errors);

    const executionTime = Date.now() - startTime;
    const success = errors.size === 0;

    return {
      success,
      results,
      errors,
      executionTime,
    };
  }

  private validateDependencies(workflow: TaskDefinition[]): void {
    const taskIds = new Set(workflow.map(task => task.id));
    
    for (const task of workflow) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          if (!taskIds.has(dep)) {
            throw new Error(`Task '${task.id}' depends on non-existent task '${dep}'`);
          }
        }
      }
    }

    // Check for circular dependencies
    this.detectCircularDependencies(workflow);
  }

  private detectCircularDependencies(workflow: TaskDefinition[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const graph = new Map<string, string[]>();

    // Build dependency graph
    for (const task of workflow) {
      graph.set(task.id, task.dependencies ?? []);
    }

    const hasCycle = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) {
        return true;
      }
      if (visited.has(taskId)) {
        return false;
      }

      visited.add(taskId);
      recursionStack.add(taskId);

      const dependencies = graph.get(taskId) ?? [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of workflow) {
      if (hasCycle(task.id)) {
        throw new Error(`Circular dependency detected involving task '${task.id}'`);
      }
    }
  }

  private async executeWorkflow(
    workflow: TaskDefinition[],
    taskContexts: Map<string, TaskExecutionContext>,
    results: Map<string, any>,
    errors: Map<string, Error>,
  ): Promise<void> {
    const taskMap = new Map(workflow.map(task => [task.id, task]));
    const completedTasks = new Set<string>();
    const runningTasks = new Set<string>();

    while (completedTasks.size < workflow.length && runningTasks.size === 0) {
      // Find tasks that can be executed (all dependencies completed)
      const readyTasks = workflow.filter(task => {
        const context = taskContexts.get(task.id)!;
        return (
          context.status === TaskStatus.PENDING &&
          task.dependencies?.every(dep => completedTasks.has(dep)) !== false
        );
      });

      if (readyTasks.length === 0) {
        // No more tasks can be executed, check if we're stuck
        const pendingTasks = workflow.filter(task => 
          taskContexts.get(task.id)!.status === TaskStatus.PENDING
        );
        
        if (pendingTasks.length > 0) {
          const stuckTask = pendingTasks[0];
          const missingDeps = stuckTask.dependencies?.filter(dep => !completedTasks.has(dep)) ?? [];
          throw new Error(
            `Workflow execution stuck. Task '${stuckTask.id}' is waiting for dependencies: ${missingDeps.join(', ')}`
          );
        }
        break;
      }

      // Execute ready tasks in parallel
      const taskPromises = readyTasks.map(async (task) => {
        const context = taskContexts.get(task.id)!;
        
        // Collect dependency results
        if (task.dependencies) {
          for (const dep of task.dependencies) {
            if (results.has(dep)) {
              context.dependencyResults.set(dep, results.get(dep));
            }
          }
        }

        runningTasks.add(task.id);
        
        try {
          const result = await this.executeTask(task, context);
          results.set(task.id, result);
          completedTasks.add(task.id);
        } catch (error) {
          errors.set(task.id, error as Error);
          completedTasks.add(task.id); // Mark as completed even if failed
        } finally {
          runningTasks.delete(task.id);
        }
      });

      await Promise.all(taskPromises);
    }
  }

  private async executeTask(
    task: TaskDefinition,
    context: TaskExecutionContext,
  ): Promise<any> {
    const maxRetries = task.retries ?? 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      context.attempts = attempt + 1;
      context.status = attempt === 0 ? TaskStatus.RUNNING : TaskStatus.RETRYING;
      context.startTime = new Date();

      this.emitLifecycleEvent(
        attempt === 0 ? TaskLifecycleEvent.TASK_STARTED : TaskLifecycleEvent.TASK_RETRY,
        context,
        attempt > 0 ? lastError : undefined,
      );

      try {
        const result = await this.executeTaskWithTimeout(task, context);
        context.status = TaskStatus.COMPLETED;
        context.endTime = new Date();
        context.result = result;

        this.emitLifecycleEvent(TaskLifecycleEvent.TASK_COMPLETED, context);
        return result;
      } catch (error) {
        lastError = error as Error;
        context.error = lastError;
        
        if (attempt === maxRetries) {
          context.status = TaskStatus.FAILED;
          context.endTime = new Date();
          this.emitLifecycleEvent(TaskLifecycleEvent.TASK_FAILED, context, lastError);
          throw lastError;
        }
      }
    }

    throw lastError!;
  }

  private async executeTaskWithTimeout(
    task: TaskDefinition,
    context: TaskExecutionContext,
  ): Promise<any> {
    const timeoutMs = task.timeoutMs ?? 2000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task '${task.id}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      task
        .handler()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private emitLifecycleEvent(
    event: TaskLifecycleEvent,
    context: TaskExecutionContext,
    error?: Error,
  ): void {
    const eventData: TaskLifecycleEventData = {
      taskId: context.id,
      event,
      timestamp: new Date(),
      attempt: context.attempts,
      error,
      result: context.result,
      message: this.formatEventMessage(event, context, error),
    };

    // Emit to event system for external listeners
    this.eventEmitter.emit(event, eventData);

    // Console logging with timestamp
    this.logger.log(eventData.message);
  }

  private formatEventMessage(
    event: TaskLifecycleEvent,
    context: TaskExecutionContext,
    error?: Error,
  ): string {
    const timestamp = new Date().toISOString();
    const taskId = context.id;

    switch (event) {
      case TaskLifecycleEvent.TASK_STARTED:
        return `[${timestamp}] Task '${taskId}' started (attempt ${context.attempts})`;
      case TaskLifecycleEvent.TASK_COMPLETED:
        const duration = context.endTime && context.startTime 
          ? context.endTime.getTime() - context.startTime.getTime()
          : 0;
        return `[${timestamp}] Task '${taskId}' completed successfully in ${duration}ms`;
      case TaskLifecycleEvent.TASK_FAILED:
        return `[${timestamp}] Task '${taskId}' failed after ${context.attempts} attempts: ${error?.message}`;
      case TaskLifecycleEvent.TASK_RETRY:
        return `[${timestamp}] Task '${taskId}' retrying (attempt ${context.attempts}) after error: ${error?.message}`;
      default:
        return `[${timestamp}] Task '${taskId}' event: ${event}`;
    }
  }
}