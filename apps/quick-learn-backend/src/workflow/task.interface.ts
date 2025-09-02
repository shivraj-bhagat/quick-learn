import { TaskStatus } from './events.enum';

export interface TaskDefinition {
  id: string;
  handler: () => Promise<any>;
  dependencies?: string[];
  retries?: number;
  timeoutMs?: number;
}

export interface TaskExecutionContext {
  id: string;
  status: TaskStatus;
  result?: any;
  error?: Error;
  attempts: number;
  maxRetries: number;
  timeoutMs: number;
  dependencies: string[];
  dependencyResults: Map<string, any>;
  startTime?: Date;
  endTime?: Date;
}

export interface WorkflowExecutionResult {
  success: boolean;
  results: Map<string, any>;
  errors: Map<string, Error>;
  executionTime: number;
}

export interface TaskLifecycleEventData {
  taskId: string;
  event: string;
  timestamp: Date;
  attempt?: number;
  error?: Error;
  result?: any;
  message: string;
}