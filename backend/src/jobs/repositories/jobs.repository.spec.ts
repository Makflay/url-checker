import { describe, expect, it } from 'vitest';

import { JobStatus } from '../enums/job-status.enum';
import type { Job } from '../interfaces/job.interface';

import { JobsRepository } from './jobs.repository';

function createJob(
  id: string,
  status: JobStatus,
  finishedAt: string | null,
): Job {
  return {
    id,
    createdAt: '2026-07-26T12:00:00.000Z',
    startedAt: status === JobStatus.PENDING ? null : '2026-07-26T12:00:01.000Z',
    finishedAt,
    status,
    items: [],
    failureMessage:
      status === JobStatus.FAILED ? 'Job processing failed' : null,
  };
}

describe('JobsRepository.countActive', () => {
  it('counts only active job states', () => {
    const repository = new JobsRepository();

    repository.create(createJob('pending', JobStatus.PENDING, null));
    repository.create(createJob('in-progress', JobStatus.IN_PROGRESS, null));
    repository.create(createJob('cancelling', JobStatus.CANCELLED, null));
    repository.create(
      createJob('cancelled', JobStatus.CANCELLED, '2026-07-26T12:02:00.000Z'),
    );
    repository.create(
      createJob('completed', JobStatus.COMPLETED, '2026-07-26T12:02:00.000Z'),
    );
    repository.create(
      createJob('failed', JobStatus.FAILED, '2026-07-26T12:02:00.000Z'),
    );

    expect(repository.countActive()).toBe(3);
  });
});
