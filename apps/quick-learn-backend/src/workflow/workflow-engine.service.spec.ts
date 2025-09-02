import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowEngineService } from './workflow-engine.service';
import { TaskDefinition } from './task.interface';
import { TaskLifecycleEvent } from './events.enum';

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Workflow Execution', () => {
    it('should execute a simple workflow successfully', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'task1',
          handler: async () => 'result1',
        },
        {
          id: 'task2',
          handler: async () => 'result2',
          dependencies: ['task1'],
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(true);
      expect(result.results.get('task1')).toBe('result1');
      expect(result.results.get('task2')).toBe('result2');
      expect(result.errors.size).toBe(0);
    });

    it('should execute independent tasks in parallel', async () => {
      const startTime = Date.now();
      const workflow: TaskDefinition[] = [
        {
          id: 'task1',
          handler: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'result1';
          },
        },
        {
          id: 'task2',
          handler: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'result2';
          },
        },
      ];

      const result = await service.run(workflow);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(150); // Should be less than sequential execution
    });
  });

  describe('Dependency Management', () => {
    it('should respect task dependencies', async () => {
      const executionOrder: string[] = [];
      const workflow: TaskDefinition[] = [
        {
          id: 'task3',
          handler: async () => {
            executionOrder.push('task3');
            return 'result3';
          },
          dependencies: ['task1', 'task2'],
        },
        {
          id: 'task1',
          handler: async () => {
            executionOrder.push('task1');
            return 'result1';
          },
        },
        {
          id: 'task2',
          handler: async () => {
            executionOrder.push('task2');
            return 'result2';
          },
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(true);
      expect(executionOrder.indexOf('task1')).toBeLessThan(executionOrder.indexOf('task3'));
      expect(executionOrder.indexOf('task2')).toBeLessThan(executionOrder.indexOf('task3'));
    });

    it('should throw error for missing dependencies', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'task1',
          handler: async () => 'result1',
          dependencies: ['nonexistent'],
        },
      ];

      await expect(service.run(workflow)).rejects.toThrow(
        "Task 'task1' depends on non-existent task 'nonexistent'"
      );
    });

    it('should detect circular dependencies', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'task1',
          handler: async () => 'result1',
          dependencies: ['task2'],
        },
        {
          id: 'task2',
          handler: async () => 'result2',
          dependencies: ['task1'],
        },
      ];

      await expect(service.run(workflow)).rejects.toThrow(
        'Circular dependency detected'
      );
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed tasks up to the specified limit', async () => {
      let attempts = 0;
      const workflow: TaskDefinition[] = [
        {
          id: 'flaky-task',
          handler: async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('Task failed');
            }
            return 'success';
          },
          retries: 2,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(true);
      expect(result.results.get('flaky-task')).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after exhausting retries', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'failing-task',
          handler: async () => {
            throw new Error('Always fails');
          },
          retries: 1,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(false);
      expect(result.errors.has('failing-task')).toBe(true);
      expect(result.errors.get('failing-task')?.message).toBe('Always fails');
    });

    it('should enforce task timeouts', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'slow-task',
          handler: async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return 'result';
          },
          timeoutMs: 100,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(false);
      expect(result.errors.has('slow-task')).toBe(true);
      expect(result.errors.get('slow-task')?.message).toContain('timed out');
    });
  });

  describe('Event Emission', () => {
    it('should emit lifecycle events', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'test-task',
          handler: async () => 'result',
        },
      ];

      await service.run(workflow);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskLifecycleEvent.TASK_STARTED,
        expect.objectContaining({
          taskId: 'test-task',
          event: TaskLifecycleEvent.TASK_STARTED,
        })
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskLifecycleEvent.TASK_COMPLETED,
        expect.objectContaining({
          taskId: 'test-task',
          event: TaskLifecycleEvent.TASK_COMPLETED,
        })
      );
    });

    it('should emit retry events', async () => {
      let attempts = 0;
      const workflow: TaskDefinition[] = [
        {
          id: 'retry-task',
          handler: async () => {
            attempts++;
            if (attempts === 1) {
              throw new Error('First attempt fails');
            }
            return 'success';
          },
          retries: 1,
        },
      ];

      await service.run(workflow);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TaskLifecycleEvent.TASK_RETRY,
        expect.objectContaining({
          taskId: 'retry-task',
          event: TaskLifecycleEvent.TASK_RETRY,
        })
      );
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complex dependency chains', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'fetchData',
          handler: async () => ({ data: 'fetched' }),
          retries: 2,
          timeoutMs: 1000,
        },
        {
          id: 'processData',
          dependencies: ['fetchData'],
          handler: async () => ({ processed: true }),
          retries: 1,
        },
        {
          id: 'saveResult',
          dependencies: ['processData'],
          handler: async () => ({ saved: true }),
        },
        {
          id: 'sendNotification',
          dependencies: ['saveResult'],
          handler: async () => ({ notified: true }),
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(true);
      expect(result.results.size).toBe(4);
      expect(result.results.get('fetchData')).toEqual({ data: 'fetched' });
      expect(result.results.get('processData')).toEqual({ processed: true });
      expect(result.results.get('saveResult')).toEqual({ saved: true });
      expect(result.results.get('sendNotification')).toEqual({ notified: true });
    });

    it('should handle mixed success and failure scenarios', async () => {
      const workflow: TaskDefinition[] = [
        {
          id: 'success-task',
          handler: async () => 'success',
        },
        {
          id: 'fail-task',
          handler: async () => {
            throw new Error('Task failed');
          },
          retries: 0,
        },
        {
          id: 'dependent-task',
          dependencies: ['success-task'],
          handler: async () => 'dependent-success',
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(false);
      expect(result.results.get('success-task')).toBe('success');
      expect(result.results.get('dependent-task')).toBe('dependent-success');
      expect(result.errors.has('fail-task')).toBe(true);
    });
  });
});