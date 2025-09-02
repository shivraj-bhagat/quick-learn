import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowEngineService } from './workflow-engine.service';
import { TaskDefinition, TaskLifecycleEventData } from './task.interface';
import { TaskLifecycleEvent } from './events.enum';
import { TaskStep } from './task.decorator';

@Injectable()
export class WorkflowExampleService {
  private readonly logger = new Logger(WorkflowExampleService.name);

  constructor(private readonly workflowEngine: WorkflowEngineService) {}

  // Example: Using the workflow engine with the provided specification
  async runExampleWorkflow(): Promise<void> {
    this.logger.log('Starting example workflow execution...');

    const workflow: TaskDefinition[] = [
      {
        id: 'fetchData',
        handler: () => this.fetchFromRemoteAPI(),
        retries: 2,
        timeoutMs: 1000,
      },
      {
        id: 'processData',
        dependencies: ['fetchData'],
        handler: () => this.processDataLocally(),
        retries: 1,
      },
      {
        id: 'saveResult',
        dependencies: ['processData'],
        handler: () => this.persistToDatabase(),
      },
    ];

    try {
      const result = await this.workflowEngine.run(workflow);
      
      if (result.success) {
        this.logger.log(`Workflow completed successfully in ${result.executionTime}ms`);
        this.logger.log('Results:', Object.fromEntries(result.results));
      } else {
        this.logger.error('Workflow failed with errors:', Object.fromEntries(result.errors));
      }
    } catch (error) {
      this.logger.error('Workflow execution failed:', error);
    }
  }

  // Example: Using decorators to define workflow tasks
  async runDecoratorBasedWorkflow(): Promise<void> {
    this.logger.log('Starting decorator-based workflow...');

    const workflow: TaskDefinition[] = [
      {
        id: 'setup',
        handler: () => this.setupEnvironment(),
        retries: 1,
      },
      {
        id: 'validate',
        dependencies: ['setup'],
        handler: () => this.validateConfiguration(),
        retries: 2,
        timeoutMs: 500,
      },
      {
        id: 'execute',
        dependencies: ['validate'],
        handler: () => this.executeMainTask(),
      },
      {
        id: 'cleanup',
        dependencies: ['execute'],
        handler: () => this.cleanupResources(),
      },
    ];

    const result = await this.workflowEngine.run(workflow);
    
    this.logger.log(`Decorator workflow result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  }

  // Example: Complex workflow with parallel execution
  async runComplexWorkflow(): Promise<void> {
    this.logger.log('Starting complex workflow with parallel execution...');

    const workflow: TaskDefinition[] = [
      // Independent initialization tasks (run in parallel)
      {
        id: 'initDatabase',
        handler: () => this.initializeDatabase(),
        retries: 2,
        timeoutMs: 2000,
      },
      {
        id: 'initCache',
        handler: () => this.initializeCache(),
        retries: 1,
        timeoutMs: 1000,
      },
      {
        id: 'loadConfig',
        handler: () => this.loadConfiguration(),
        retries: 1,
      },
      
      // Data processing tasks (depend on initialization)
      {
        id: 'fetchUserData',
        dependencies: ['initDatabase'],
        handler: () => this.fetchUserData(),
        retries: 2,
      },
      {
        id: 'fetchProductData',
        dependencies: ['initDatabase'],
        handler: () => this.fetchProductData(),
        retries: 2,
      },
      
      // Processing tasks (can run in parallel)
      {
        id: 'processUsers',
        dependencies: ['fetchUserData', 'loadConfig'],
        handler: () => this.processUsers(),
        retries: 1,
      },
      {
        id: 'processProducts',
        dependencies: ['fetchProductData', 'loadConfig'],
        handler: () => this.processProducts(),
        retries: 1,
      },
      
      // Final aggregation (depends on all processing)
      {
        id: 'generateReport',
        dependencies: ['processUsers', 'processProducts', 'initCache'],
        handler: () => this.generateReport(),
        timeoutMs: 3000,
      },
    ];

    const result = await this.workflowEngine.run(workflow);
    
    this.logger.log(`Complex workflow completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    this.logger.log(`Execution time: ${result.executionTime}ms`);
    
    if (!result.success) {
      this.logger.error('Errors encountered:', Object.fromEntries(result.errors));
    }
  }

  // Event listeners for external monitoring
  @OnEvent(TaskLifecycleEvent.TASK_STARTED)
  handleTaskStarted(eventData: TaskLifecycleEventData): void {
    // External systems can listen to this event
    this.logger.debug(`External listener: Task ${eventData.taskId} started`);
  }

  @OnEvent(TaskLifecycleEvent.TASK_COMPLETED)
  handleTaskCompleted(eventData: TaskLifecycleEventData): void {
    // External systems can listen to this event
    this.logger.debug(`External listener: Task ${eventData.taskId} completed`);
  }

  @OnEvent(TaskLifecycleEvent.TASK_FAILED)
  handleTaskFailed(eventData: TaskLifecycleEventData): void {
    // External systems can listen to this event for monitoring/alerting
    this.logger.warn(`External listener: Task ${eventData.taskId} failed: ${eventData.error?.message}`);
  }

  @OnEvent(TaskLifecycleEvent.TASK_RETRY)
  handleTaskRetry(eventData: TaskLifecycleEventData): void {
    // External systems can listen to this event for monitoring
    this.logger.debug(`External listener: Task ${eventData.taskId} retrying (attempt ${eventData.attempt})`);
  }

  // Mock implementations for example purposes
  @TaskStep({ id: 'fetchData', retries: 2, timeoutMs: 1000 })
  private async fetchFromRemoteAPI(): Promise<any> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    if (Math.random() < 0.1) { // 10% chance of failure for demo
      throw new Error('API temporarily unavailable');
    }
    
    return {
      users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
      timestamp: new Date().toISOString(),
    };
  }

  @TaskStep({ dependencies: ['fetchData'], retries: 1 })
  private async processDataLocally(): Promise<any> {
    // Simulate data processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    
    return {
      processedCount: 2,
      transformedData: 'processed-result',
      processingTime: Date.now(),
    };
  }

  @TaskStep({ dependencies: ['processData'] })
  private async persistToDatabase(): Promise<any> {
    // Simulate database persistence
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
    
    return {
      recordsInserted: 2,
      transactionId: `tx_${Date.now()}`,
      success: true,
    };
  }

  // Additional mock methods for complex workflow
  private async setupEnvironment(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { environment: 'production', version: '1.0.0' };
  }

  private async validateConfiguration(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { configValid: true, checksRun: 5 };
  }

  private async executeMainTask(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { taskResult: 'main-task-completed', itemsProcessed: 100 };
  }

  private async cleanupResources(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 20));
    return { resourcesCleaned: true, tempFilesRemoved: 3 };
  }

  private async initializeDatabase(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 80));
    return { dbConnected: true, poolSize: 10 };
  }

  private async initializeCache(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 40));
    return { cacheReady: true, size: '100MB' };
  }

  private async loadConfiguration(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { config: { maxRetries: 3, timeout: 5000 } };
  }

  private async fetchUserData(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 60));
    return { users: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `User${i}` })) };
  }

  private async fetchProductData(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 70));
    return { products: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Product${i}` })) };
  }

  private async processUsers(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 90));
    return { processedUsers: 1000, validUsers: 950 };
  }

  private async processProducts(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 85));
    return { processedProducts: 500, activeProducts: 480 };
  }

  private async generateReport(): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 120));
    return {
      reportGenerated: true,
      totalUsers: 950,
      totalProducts: 480,
      reportSize: '2.5MB',
      generatedAt: new Date().toISOString(),
    };
  }
}