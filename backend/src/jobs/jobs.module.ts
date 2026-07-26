import { Module } from '@nestjs/common';

import { JobsController } from './jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './jobs.service';
import { HttpClientService } from './http/http-client.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobsRepository, HttpClientService],
})
export class JobsModule {}
