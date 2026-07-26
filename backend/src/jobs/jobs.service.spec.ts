import { Test, type TestingModule } from '@nestjs/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';

import type { CreateJobDto } from './dto/create-job.dto';
import { JobStatus } from './enums/job-status.enum';
import { UrlCheckStatus } from './enums/url-check-status.enum';
import type { Job } from './interfaces/job.interface';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let createJobMock: MockedFunction<JobsRepository['create']>;

  beforeEach(async () => {
    createJobMock = vi.fn((job: Job): Job => job);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: JobsRepository,
          useValue: {
            create: createJobMock,
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('creates and saves a pending job', () => {
    const dto: CreateJobDto = {
      urls: ['https://example.com', 'https://openai.com'],
    };

    const result = service.create(dto);

    expect(result.jobId).toEqual(expect.any(String));
    expect(result.jobId).not.toHaveLength(0);
    expect(createJobMock).toHaveBeenCalledTimes(1);

    const savedJob = createJobMock.mock.calls[0]?.[0];

    expect(savedJob).toBeDefined();

    if (!savedJob) {
      throw new Error('Expected repository.create to receive a job');
    }

    expect(savedJob.id).toBe(result.jobId);
    expect(savedJob.status).toBe(JobStatus.PENDING);
    expect(savedJob.startedAt).toBeNull();
    expect(savedJob.finishedAt).toBeNull();
    expect(savedJob.failureMessage).toBeNull();
    expect(savedJob.items).toHaveLength(dto.urls.length);
    expect(savedJob.items.map((item) => item.url)).toEqual(dto.urls);

    expect(new Date(savedJob.createdAt).toISOString()).toBe(savedJob.createdAt);

    const itemIds = savedJob.items.map((item) => item.id);

    expect(new Set(itemIds).size).toBe(itemIds.length);

    savedJob.items.forEach((item) => {
      expect(item.id).toEqual(expect.any(String));
      expect(item.id).not.toHaveLength(0);
      expect(item.status).toBe(UrlCheckStatus.PENDING);
      expect(item.httpStatus).toBeNull();
      expect(item.errorMessage).toBeNull();
      expect(item.startedAt).toBeNull();
      expect(item.finishedAt).toBeNull();
      expect(item.durationMs).toBeNull();
    });
  });

  it('preserves duplicate URLs as separate items', () => {
    const duplicateUrl = 'https://example.com';

    const dto: CreateJobDto = {
      urls: [duplicateUrl, duplicateUrl],
    };

    service.create(dto);

    const savedJob = createJobMock.mock.calls[0]?.[0];

    expect(savedJob).toBeDefined();

    if (!savedJob) {
      throw new Error('Expected repository.create to receive a job');
    }

    expect(savedJob.items).toHaveLength(2);
    expect(savedJob.items[0]?.url).toBe(duplicateUrl);
    expect(savedJob.items[1]?.url).toBe(duplicateUrl);
    expect(savedJob.items[0]?.id).not.toBe(savedJob.items[1]?.id);
  });
});
