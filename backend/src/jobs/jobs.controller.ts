import { Body, Controller, Post, Get, Param } from '@nestjs/common';

import { CreateJobDto } from './dto/create-job.dto';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import type { JobDetails } from './interfaces/job-details.interface';
import type { JobSummary } from './interfaces/job-summary.interface';
import { JobsService } from './jobs.service';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto): CreateJobResponse {
    return this.jobsService.create(dto);
  }

  @Get()
  findAll(): JobSummary[] {
    return this.jobsService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string): JobDetails {
    return this.jobsService.findById(id);
  }
}
