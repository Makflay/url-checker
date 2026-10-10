import { Injectable } from '@nestjs/common';

import type { Job } from '../interfaces/job.interface';

import { JobStatus } from '../enums/job-status.enum';

@Injectable()
export class JobsRepository {
  private readonly jobs = new Map<string, Job>();

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
    if (!this.jobs.has(id)) {
      return undefined;
    }

    if (job.id !== id) {
      throw new Error(
        `Cannot update job with ID "${id}" using job wiht ID "${job.id}"`,
      );
    }

    this.jobs.set(id, job);

    return job;
  }
}
