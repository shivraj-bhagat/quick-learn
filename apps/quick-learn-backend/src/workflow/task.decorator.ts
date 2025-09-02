import { SetMetadata } from '@nestjs/common';

export const TASK_METADATA_KEY = 'task_metadata';

export interface TaskStepOptions {
  id?: string;
  dependencies?: string[];
  retries?: number;
  timeoutMs?: number;
}

export const TaskStep = (options: TaskStepOptions = {}) => {
  return SetMetadata(TASK_METADATA_KEY, options);
};