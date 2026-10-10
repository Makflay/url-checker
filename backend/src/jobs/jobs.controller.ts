import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import type { JobDetails } from './interfaces/job-details.interface';
import type { JobSummary } from './interfaces/job-summary.interface';

import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';
import { JobCreationRateLimitException } from './job-creation-rate-limiter.service';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(
    @Body() dto: CreateJobDto,
    @Res({ passthrough: true }) response: Response,
  ): CreateJobResponse {
    try {
      return this.jobsService.create(dto);
    } catch (error: unknown) {
      if (error instanceof JobCreationRateLimitException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }

      throw error;
    }
  }

  @Get()
  findAll(): JobSummary[] {
    return this.jobsService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string): JobDetails {
    return this.jobsService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id') id: string): void {
    this.jobsService.cancel(id);
  }
}
