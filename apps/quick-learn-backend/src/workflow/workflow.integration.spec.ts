import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowModule } from './workflow.module';
import { TaskDefinition } from './task.interface';
import { TaskLifecycleEvent } from './events.enum';

describe('Workflow Integration Tests', () => {
  let service: WorkflowEngineService;
  let eventEmitter: EventEmitter2;
  let eventHistory: any[] = [];

  beforeEach(async () => {
    eventHistory = [];
    
    const module: TestingModule = await Test.createTestingModule({
      imports: [WorkflowModule],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Listen to all lifecycle events
    Object.values(TaskLifecycleEvent).forEach(event => {
      eventEmitter.on(event, (data) => {
        eventHistory.push({ event, data });
      });
    });
  });

  describe('End-to-End Workflow Execution', () => {
    it('should execute the example workflow from requirements', async () => {
      // Mock external dependencies
      const fetchFromRemoteAPI = jest.fn().mockResolvedValue({ data: 'api-data' });
      const processDataLocally = jest.fn().mockResolvedValue({ processed: 'local-data' });
      const persistToDatabase = jest.fn().mockResolvedValue({ persisted: true });

      const workflow: TaskDefinition[] = [
        {
          id: 'fetchData',
          handler: fetchFromRemoteAPI,
          retries: 2,
          timeoutMs: 1000,
        },
        {
          id: 'processData',
          dependencies: ['fetchData'],
          handler: processDataLocally,
          retries: 1,
        },
        {
          id: 'saveResult',
          dependencies: ['processData'],
          handler: persistToDatabase,
        },
      ];

      const result = await service.run(workflow);

      // Verify execution success
      expect(result.success).toBe(true);
      expect(result.results.get('fetchData')).toEqual({ data: 'api-data' });
      expect(result.results.get('processData')).toEqual({ processed: 'local-data' });
      expect(result.results.get('saveResult')).toEqual({ persisted: true });

      // Verify function calls
      expect(fetchFromRemoteAPI).toHaveBeenCalledTimes(1);
      expect(processDataLocally).toHaveBeenCalledTimes(1);
      expect(persistToDatabase).toHaveBeenCalledTimes(1);

      // Verify event emission
      expect(eventHistory.length).toBe(6); // 3 STARTED + 3 COMPLETED events
      expect(eventHistory.filter(e => e.event === TaskLifecycleEvent.TASK_STARTED)).toHaveLength(3);
      expect(eventHistory.filter(e => e.event === TaskLifecycleEvent.TASK_COMPLETED)).toHaveLength(3);
    });

    it('should handle failure and retry scenarios', async () => {
      let fetchAttempts = 0;
      const fetchFromRemoteAPI = jest.fn().mockImplementation(async () => {
        fetchAttempts++;
        if (fetchAttempts < 2) {
          throw new Error('Network error');
        }
        return { data: 'api-data' };
      });

      const processDataLocally = jest.fn().mockResolvedValue({ processed: 'local-data' });

      const workflow: TaskDefinition[] = [
        {
          id: 'fetchData',
          handler: fetchFromRemoteAPI,
          retries: 2,
          timeoutMs: 1000,
        },
        {
          id: 'processData',
          dependencies: ['fetchData'],
          handler: processDataLocally,
          retries: 1,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(true);
      expect(fetchAttempts).toBe(2);
      expect(fetchFromRemoteAPI).toHaveBeenCalledTimes(2);
      expect(processDataLocally).toHaveBeenCalledTimes(1);

      // Verify retry events
      const retryEvents = eventHistory.filter(e => e.event === TaskLifecycleEvent.TASK_RETRY);
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].data.taskId).toBe('fetchData');
    });

    it('should handle complete workflow failure', async () => {
      const fetchFromRemoteAPI = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      const processDataLocally = jest.fn().mockResolvedValue({ processed: 'local-data' });

      const workflow: TaskDefinition[] = [
        {
          id: 'fetchData',
          handler: fetchFromRemoteAPI,
          retries: 1,
          timeoutMs: 1000,
        },
        {
          id: 'processData',
          dependencies: ['fetchData'],
          handler: processDataLocally,
          retries: 1,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(false);
      expect(result.errors.has('fetchData')).toBe(true);
      expect(result.errors.get('fetchData')?.message).toBe('Persistent failure');
      expect(fetchFromRemoteAPI).toHaveBeenCalledTimes(2); // Original + 1 retry
      expect(processDataLocally).not.toHaveBeenCalled(); // Should not execute due to dependency failure

      // Verify failure events
      const failEvents = eventHistory.filter(e => e.event === TaskLifecycleEvent.TASK_FAILED);
      expect(failEvents).toHaveLength(1);
      expect(failEvents[0].data.taskId).toBe('fetchData');
    });

    it('should handle timeout scenarios', async () => {
      const slowTask = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'result';
      });

      const workflow: TaskDefinition[] = [
        {
          id: 'slow-task',
          handler: slowTask,
          timeoutMs: 100,
          retries: 0,
        },
      ];

      const result = await service.run(workflow);

      expect(result.success).toBe(false);
      expect(result.errors.has('slow-task')).toBe(true);
      expect(result.errors.get('slow-task')?.message).toContain('timed out after 100ms');
    });
  });

  describe('Event Listener Integration', () => {
    it('should allow external listeners to respond to events', async () => {
      const externalEventHandler = jest.fn();
      eventEmitter.on(TaskLifecycleEvent.TASK_COMPLETED, externalEventHandler);

      const workflow: TaskDefinition[] = [
        {
          id: 'test-task',
          handler: async () => 'result',
        },
      ];

      await service.run(workflow);

      expect(externalEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'test-task',
          event: TaskLifecycleEvent.TASK_COMPLETED,
          result: 'result',
        })
      );
    });

    it('should provide comprehensive event data', async () => {
      let eventData: any;
      eventEmitter.on(TaskLifecycleEvent.TASK_COMPLETED, (data) => {
        eventData = data;
      });

      const workflow: TaskDefinition[] = [
        {
          id: 'data-task',
          handler: async () => ({ key: 'value' }),
        },
      ];

      await service.run(workflow);

      expect(eventData).toMatchObject({
        taskId: 'data-task',
        event: TaskLifecycleEvent.TASK_COMPLETED,
        timestamp: expect.any(Date),
        attempt: 1,
        result: { key: 'value' },
        message: expect.stringContaining("Task 'data-task' completed successfully"),
      });
    });
  });

  describe('Performance and Concurrency', () => {
    it('should execute independent tasks concurrently', async () => {
      const task1StartTime = jest.fn();
      const task2StartTime = jest.fn();
      const task1EndTime = jest.fn();
      const task2EndTime = jest.fn();

      const workflow: TaskDefinition[] = [
        {
          id: 'concurrent-task-1',
          handler: async () => {
            task1StartTime();
            await new Promise(resolve => setTimeout(resolve, 50));
            task1EndTime();
            return 'result1';
          },
        },
        {
          id: 'concurrent-task-2',
          handler: async () => {
            task2StartTime();
            await new Promise(resolve => setTimeout(resolve, 50));
            task2EndTime();
            return 'result2';
          },
        },
      ];

      const startTime = Date.now();
      const result = await service.run(workflow);
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(80); // Should be less than sequential execution (100ms)
      expect(task1StartTime).toHaveBeenCalled();
      expect(task2StartTime).toHaveBeenCalled();
      expect(task1EndTime).toHaveBeenCalled();
      expect(task2EndTime).toHaveBeenCalled();
    });
  });
});