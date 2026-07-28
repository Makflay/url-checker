import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { CreateJobDto } from './dto/create-job.dto';
import { JobStatus } from './enums/job-status.enum';
import { UrlCheckStatus } from './enums/url-check-status.enum';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import type { JobItem } from './interfaces/job-item.interface';
import type { Job } from './interfaces/job.interface';
import type { JobDetails } from './interfaces/job-details.interface';
import type { JobStatistics } from './interfaces/job-statistics.interface';
import type { JobSummary } from './interfaces/job-summary.interface';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsProcessor } from './processors/jobs.processor';

@Injectable()
export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly jobsProcessor: JobsProcessor,
  ) {}

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
    void this.jobsProcessor.process(jobId);

    return { jobId };
  }

  findAll(): JobSummary[] {
    return this.jobsRepository.findAll().map((job) => this.toSummary(job));
  }

  findById(id: string): JobDetails {
    const job = this.jobsRepository.findById(id);

    if (!job) {
      throw new NotFoundException(`Job with id ${id} was not found`);
    }

    return this.toDetails(job);
  }

  cancel(id: string): void {
    const job = this.getJobOrThrow(id);

    if (job.status === JobStatus.CANCELLED) {
      return;
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      throw new ConflictException(
        `Job with id ${id} cannot be cancelled from status ${job.status}`,
      );
    }

    const cancelledAt = new Date().toISOString();

    const items: JobItem[] = job.items.map((item): JobItem => {
      if (item.status !== UrlCheckStatus.PENDING) {
        return item;
      }

      return {
        ...item,
        status: UrlCheckStatus.CANCELLED,
        httpStatus: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: cancelledAt,
        durationMs: 0,
      };
    });

    const hasInProgressItems = items.some(
      (item) => item.status === UrlCheckStatus.IN_PROGRESS,
    );

    const cancelledJob: Job = {
      ...job,
      status: JobStatus.CANCELLED,
      finishedAt: hasInProgressItems ? null : cancelledAt,
      failureMessage: null,
      items,
    };

    this.jobsRepository.update(id, cancelledJob);
  }

  private getJobOrThrow(id: string): Job {
    const job = this.jobsRepository.findById(id);

    if (!job) {
      throw new NotFoundException(`Job with id ${id} was not found`);
    }

    return job;
  }

  private calculateStatistics(job: Job): JobStatistics {
    const statistics: JobStatistics = {
      total: job.items.length,
      pending: 0,
      inProgress: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      processed: 0,
    };

    for (const item of job.items) {
      switch (item.status) {
        case UrlCheckStatus.PENDING:
          statistics.pending += 1;
          break;

        case UrlCheckStatus.IN_PROGRESS:
          statistics.inProgress += 1;
          break;

        case UrlCheckStatus.SUCCESS:
          statistics.success += 1;
          break;

        case UrlCheckStatus.ERROR:
          statistics.error += 1;
          break;

        case UrlCheckStatus.CANCELLED:
          statistics.cancelled += 1;
          break;
      }
    }

    statistics.processed =
      statistics.success + statistics.error + statistics.cancelled;

    return statistics;
  }

  private toSummary(job: Job): JobSummary {
    return {
      id: job.id,
      createdAt: job.createdAt,
      status: job.status,
      statistics: this.calculateStatistics(job),
    };
  }

  private toDetails(job: Job): JobDetails {
    return {
      id: job.id,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      status: job.status,
      statistics: this.calculateStatistics(job),
      items: job.items.map((item) => ({ ...item })),
      failureMessage: job.failureMessage,
    };
  }
}
