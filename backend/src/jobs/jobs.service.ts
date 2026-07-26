import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { CreateJobDto } from './dto/create-job.dto';
import { JobStatus } from './enums/job-status.enum';
import { UrlCheckStatus } from './enums/url-check-status.enum';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import type { JobItem } from './interfaces/job-item.interface';
import type { Job } from './interfaces/job.interface';
import { JobsRepository } from './repositories/jobs.repository';

@Injectable()
export class JobsService {
  constructor(private readonly jobsRepository: JobsRepository) {}

  create(dto: CreateJobDto): CreateJobResponse {
    const jobId = randomUUID();
    const createdAt = new Date().toISOString();

    const items: JobItem[] = dto.urls.map((url): JobItem => ({
      id: randomUUID(),
      url,
      status: UrlCheckStatus.PENDING,
      httpStatus: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    }));

    const job: Job = {
      id: jobId,
      createdAt,
      startedAt: null,
      finishedAt: null,
      status: JobStatus.PENDING,
      items,
      failureMessage: null,
    };

    this.jobsRepository.create(job);

    return { jobId };
  }
}
