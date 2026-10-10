import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { jobsConfig } from '../config';

import { JobsController } from './jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './jobs.service';
import { HttpClientService } from './http/http-client.service';
import { JobsProcessor } from './processors/jobs.processor';
import { JobCreationRateLimiter } from './job-creation-rate-limiter.service';
import { GlobalHeadSemaphore } from './global-head-semaphore.service';

@Module({
  imports: [ConfigModule.forFeature(jobsConfig)],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsRepository,
    HttpClientService,
    JobsProcessor,
    JobCreationRateLimiter,
    GlobalHeadSemaphore,
  ],
})
export class JobsModule {}
