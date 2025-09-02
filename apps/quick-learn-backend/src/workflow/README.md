# NestJS Workflow Engine

A lightweight in-memory workflow engine for NestJS that executes tasks with dependencies, supports retries, timeouts, and emits lifecycle events.

## Features

- ✅ **Task Dependencies**: Execute tasks in the correct order based on dependencies
- ✅ **Parallel Execution**: Independent tasks run concurrently for optimal performance
- ✅ **Retry Mechanism**: Configurable retry attempts for failed tasks
- ✅ **Timeout Enforcement**: Prevent tasks from running indefinitely
- ✅ **Lifecycle Events**: Comprehensive event system for monitoring
- ✅ **Error Handling**: Robust error handling with detailed reporting
- ✅ **Type Safety**: Full TypeScript support with strong typing
- ✅ **Decorator Support**: Optional `@TaskStep()` decorator for task definition
- ✅ **Console Logging**: Detailed logging with timestamps for all events

## Basic Usage

```typescript
import { WorkflowEngineService, TaskDefinition } from './workflow';

// Define your workflow
const workflow: TaskDefinition[] = [
  {
    id: 'fetchData',
    handler: () => fetchFromRemoteAPI(),
    retries: 2,
    timeoutMs: 1000
  },
  {
    id: 'processData',
    dependencies: ['fetchData'],
    handler: () => processDataLocally(),
    retries: 1
  },
  {
    id: 'saveResult',
    dependencies: ['processData'],
    handler: () => persistToDatabase()
  }
];

// Execute the workflow
const result = await workflowEngine.run(workflow);

if (result.success) {
  console.log('Workflow completed successfully!');
  console.log('Results:', Object.fromEntries(result.results));
} else {
  console.log('Workflow failed with errors:', Object.fromEntries(result.errors));
}
```

## Task Definition

```typescript
interface TaskDefinition {
  id: string;                    // Unique task identifier
  handler: () => Promise<any>;   // Task execution function
  dependencies?: string[];       // Array of task IDs this task depends on
  retries?: number;             // Number of retry attempts (default: 0)
  timeoutMs?: number;           // Timeout in milliseconds (default: 2000)
}
```

## Event System

The workflow engine emits lifecycle events that external systems can listen to:

```typescript
import { OnEvent } from '@nestjs/event-emitter';
import { TaskLifecycleEvent, TaskLifecycleEventData } from './workflow';

@Injectable()
export class WorkflowMonitorService {
  @OnEvent(TaskLifecycleEvent.TASK_STARTED)
  handleTaskStarted(eventData: TaskLifecycleEventData) {
    console.log(`Task ${eventData.taskId} started`);
  }

  @OnEvent(TaskLifecycleEvent.TASK_COMPLETED)
  handleTaskCompleted(eventData: TaskLifecycleEventData) {
    console.log(`Task ${eventData.taskId} completed with result:`, eventData.result);
  }

  @OnEvent(TaskLifecycleEvent.TASK_FAILED)
  handleTaskFailed(eventData: TaskLifecycleEventData) {
    console.error(`Task ${eventData.taskId} failed:`, eventData.error);
  }

  @OnEvent(TaskLifecycleEvent.TASK_RETRY)
  handleTaskRetry(eventData: TaskLifecycleEventData) {
    console.log(`Task ${eventData.taskId} retrying (attempt ${eventData.attempt})`);
  }
}
```

## Decorator Usage (Bonus Feature)

```typescript
import { TaskStep } from './workflow';

class MyWorkflowService {
  @TaskStep({ id: 'fetchData', retries: 2, timeoutMs: 1000 })
  async fetchData() {
    // Task implementation
    return await fetch('/api/data');
  }

  @TaskStep({ dependencies: ['fetchData'], retries: 1 })
  async processData() {
    // Task implementation
    return processedData;
  }
}
```

## API Endpoints

The workflow engine provides REST endpoints for testing and demonstration:

- `POST /workflow/execute` - Execute a custom workflow
- `GET /workflow/example/simple` - Run the basic example workflow
- `GET /workflow/example/decorator` - Run decorator-based workflow example
- `GET /workflow/example/complex` - Run complex workflow with parallel execution
- `GET /workflow/health` - Health check endpoint

## Error Handling

The engine provides comprehensive error handling:

1. **Dependency Validation**: Checks for missing or circular dependencies
2. **Timeout Enforcement**: Tasks that exceed their timeout are automatically cancelled
3. **Retry Logic**: Failed tasks are retried up to the configured limit
4. **Graceful Degradation**: Workflow continues executing independent tasks even if some fail

## Performance Features

- **Parallel Execution**: Tasks without dependencies run concurrently
- **Efficient Scheduling**: Minimal overhead in task scheduling and execution
- **Memory Efficient**: In-memory execution with automatic cleanup
- **Event-Driven**: Non-blocking event emission for monitoring

## Testing

The workflow engine includes comprehensive test coverage:

- Unit tests for core functionality
- Integration tests for end-to-end workflows
- Performance tests for parallel execution
- Error scenario testing

Run tests with:
```bash
npm test workflow
```

## Architecture

```
WorkflowModule
├── WorkflowEngineService (Core execution engine)
├── WorkflowExampleService (Example implementations)
├── WorkflowController (REST API)
├── TaskDefinition (Interface)
├── TaskLifecycleEvent (Events enum)
└── TaskStep (Decorator)
```

## Example Workflows

### Simple Linear Workflow
```typescript
const linearWorkflow = [
  { id: 'step1', handler: () => doStep1() },
  { id: 'step2', dependencies: ['step1'], handler: () => doStep2() },
  { id: 'step3', dependencies: ['step2'], handler: () => doStep3() }
];
```

### Parallel + Sequential Workflow
```typescript
const hybridWorkflow = [
  // These run in parallel
  { id: 'init1', handler: () => initService1() },
  { id: 'init2', handler: () => initService2() },
  
  // This waits for both initializations
  { id: 'process', dependencies: ['init1', 'init2'], handler: () => processData() },
  
  // Final step
  { id: 'finalize', dependencies: ['process'], handler: () => finalize() }
];
```