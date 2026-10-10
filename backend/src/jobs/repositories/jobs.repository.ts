import { Inject, Injectable } from '@nestjs/common';

import type { Job } from '../interfaces/job.interface';
import type { JobsConfig } from '../../config';

import { jobsConfig } from '../../config';
import { JobStatus } from '../enums/job-status.enum';

@Injectable()
export class JobsRepository {
  private readonly jobs = new Map<string, Job>();

  constructor(
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
  ) {}

  create(job: Job): Job {
    if (this.jobs.has(job.id)) {
      throw new Error(`Job with ID "${job.id}" already exists`);
    }

    this.jobs.set(job.id, job);

    return job;
  }

  findAll(): Job[] {
    return [...this.jobs.values()].sort(
      (firstJob, secondJob) =>
        Date.parse(secondJob.createdAt) - Date.parse(firstJob.createdAt),
    );
  }

  findById(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  countActive(): number {
    let activeJobs = 0;

    for (const job of this.jobs.values()) {
      const isActive =
        job.status === JobStatus.PENDING ||
        job.status === JobStatus.IN_PROGRESS ||
        (job.status === JobStatus.CANCELLED && job.finishedAt === null);

      if (isActive) {
        activeJobs += 1;
      }
    }

    return activeJobs;
  }

  update(id: string, job: Job): Job | undefined {
    const previousJob = this.jobs.get(id);

    if (previousJob === undefined) {
      return undefined;
    }

    if (job.id !== id) {
      throw new Error(
        `Cannot update job with ID "${id}" using job with ID "${job.id}"`,
      );
    }

    const becameTerminal =
      !this.isTerminal(previousJob) && this.isTerminal(job);

    this.jobs.set(id, job);

    if (becameTerminal) {
      this.pruneTerminalHistory();
    }

    return job;
  }

  private isTerminal(job: Job): boolean {
    return (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      (job.status === JobStatus.CANCELLED && job.finishedAt !== null)
    );
  }

  private pruneTerminalHistory(): void {
    const terminalJobs: Job[] = [];

    for (const job of this.jobs.values()) {
      if (this.isTerminal(job)) {
        terminalJobs.push(job);
      }
    }

    const overflow = terminalJobs.length - this.config.maxCompletedJobsHistory;

    if (overflow <= 0) {
      return;
    }

    terminalJobs.sort(
      (firstJob, secondJob) =>
        Date.parse(firstJob.createdAt) - Date.parse(secondJob.createdAt),
    );

    for (let index = 0; index < overflow; index += 1) {
      const jobToDelete = terminalJobs[index];

      if (jobToDelete !== undefined) {
        this.jobs.delete(jobToDelete.id);
      }
    }
  }
}
