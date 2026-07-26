import { Body, Controller, Post } from '@nestjs/common';

import { CreateJobDto } from './dto/create-job.dto';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import { JobsService } from './jobs.service';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto): CreateJobResponse {
    return this.jobsService.create(dto);
  }
}
