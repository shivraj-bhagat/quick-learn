import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowExampleService } from './workflow-example.service';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [WorkflowController],
  providers: [WorkflowEngineService, WorkflowExampleService],
  exports: [WorkflowEngineService, WorkflowExampleService],
})
export class WorkflowModule {}