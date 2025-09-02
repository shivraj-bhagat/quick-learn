import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowExampleService } from './workflow-example.service';
import { TaskDefinition } from './task.interface';

@Controller('workflow')
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(
    private readonly workflowEngine: WorkflowEngineService,
    private readonly workflowExample: WorkflowExampleService,
  ) {}

  @Post('execute')
  async executeWorkflow(@Body() workflow: TaskDefinition[]) {
    this.logger.log(`Executing workflow with ${workflow.length} tasks`);
    
    try {
      const result = await this.workflowEngine.run(workflow);
      return {
        success: result.success,
        executionTime: result.executionTime,
        results: Object.fromEntries(result.results),
        errors: Object.fromEntries(
          Array.from(result.errors.entries()).map(([key, error]) => [
            key,
            { message: error.message, stack: error.stack },
          ])
        ),
      };
    } catch (error) {
      this.logger.error('Workflow execution failed:', error);
      throw error;
    }
  }

  @Get('example/simple')
  async runSimpleExample() {
    this.logger.log('Running simple workflow example');
    await this.workflowExample.runExampleWorkflow();
    return { message: 'Simple workflow example completed' };
  }

  @Get('example/decorator')
  async runDecoratorExample() {
    this.logger.log('Running decorator-based workflow example');
    await this.workflowExample.runDecoratorBasedWorkflow();
    return { message: 'Decorator-based workflow example completed' };
  }

  @Get('example/complex')
  async runComplexExample() {
    this.logger.log('Running complex workflow example');
    await this.workflowExample.runComplexWorkflow();
    return { message: 'Complex workflow example completed' };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'workflow-engine',
      timestamp: new Date().toISOString(),
    };
  }
}