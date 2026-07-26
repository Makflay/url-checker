import { NotFoundException } from '@nestjs/common';
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
import type { JobItem } from './interfaces/job-item.interface';
import type { Job } from './interfaces/job.interface';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './jobs.service';
import { JobsProcessor } from './processors/jobs.processor';

function createItem(id: string, url: string, status: UrlCheckStatus): JobItem {
  return {
    id,
    url,
    status,
    httpStatus: status === UrlCheckStatus.SUCCESS ? 200 : null,
    errorMessage: status === UrlCheckStatus.ERROR ? 'Request failed' : null,
    startedAt:
      status === UrlCheckStatus.PENDING ? null : '2026-07-26T12:01:00.000Z',
    finishedAt:
      status === UrlCheckStatus.SUCCESS ||
      status === UrlCheckStatus.ERROR ||
      status === UrlCheckStatus.CANCELLED
        ? '2026-07-26T12:01:01.000Z'
        : null,
    durationMs:
      status === UrlCheckStatus.SUCCESS || status === UrlCheckStatus.ERROR
        ? 1000
        : null,
  };
}

function createStoredJob(items: JobItem[]): Job {
  return {
    id: 'job-1',
    createdAt: '2026-07-26T12:00:00.000Z',
    startedAt: '2026-07-26T12:01:00.000Z',
    finishedAt: null,
    status: JobStatus.IN_PROGRESS,
    items,
    failureMessage: null,
  };
}

describe('JobsService', () => {
  let service: JobsService;

  let createJobMock: MockedFunction<JobsRepository['create']>;
  let findAllJobsMock: MockedFunction<JobsRepository['findAll']>;
  let findJobByIdMock: MockedFunction<JobsRepository['findById']>;
  let processJobMock: MockedFunction<JobsProcessor['process']>;

  beforeEach(async () => {
    createJobMock = vi.fn((job: Job): Job => job);
    findAllJobsMock = vi.fn((): Job[] => []);
    findJobByIdMock = vi.fn((): Job | undefined => undefined);
    processJobMock = vi.fn((_jobId: string): Promise<void> =>
      Promise.resolve(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: JobsRepository,
          useValue: {
            create: createJobMock,
            findAll: findAllJobsMock,
            findById: findJobByIdMock,
          },
        },
        {
          provide: JobsProcessor,
          useValue: {
            process: processJobMock,
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('create', () => {
    it('saves a pending job and starts background processing', () => {
      const dto: CreateJobDto = {
        urls: ['https://example.com', 'https://example.org'],
      };

      const result = service.create(dto);

      expect(result.jobId).toEqual(expect.any(String));
      expect(result.jobId).not.toHaveLength(0);

      expect(createJobMock).toHaveBeenCalledTimes(1);

      expect(processJobMock).toHaveBeenCalledTimes(1);
      expect(processJobMock).toHaveBeenCalledWith(result.jobId);

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

      expect(new Date(savedJob.createdAt).toISOString()).toBe(
        savedJob.createdAt,
      );

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

  describe('findAll', () => {
    it('returns an empty array when there are no jobs', () => {
      findAllJobsMock.mockReturnValue([]);

      const result = service.findAll();

      expect(result).toEqual([]);
      expect(findAllJobsMock).toHaveBeenCalledTimes(1);
    });

    it('returns job summaries with calculated statistics', () => {
      const job = createStoredJob([
        createItem(
          'item-1',
          'https://pending.example.com',
          UrlCheckStatus.PENDING,
        ),
        createItem(
          'item-2',
          'https://in-progress.example.com',
          UrlCheckStatus.IN_PROGRESS,
        ),
        createItem(
          'item-3',
          'https://success-one.example.com',
          UrlCheckStatus.SUCCESS,
        ),
        createItem(
          'item-4',
          'https://success-two.example.com',
          UrlCheckStatus.SUCCESS,
        ),
        createItem('item-5', 'https://error.example.com', UrlCheckStatus.ERROR),
        createItem(
          'item-6',
          'https://cancelled.example.com',
          UrlCheckStatus.CANCELLED,
        ),
      ]);

      findAllJobsMock.mockReturnValue([job]);

      const result = service.findAll();

      expect(findAllJobsMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);

      expect(result[0]).toEqual({
        id: job.id,
        createdAt: job.createdAt,
        status: job.status,
        statistics: {
          total: 6,
          pending: 1,
          inProgress: 1,
          success: 2,
          error: 1,
          cancelled: 1,
          processed: 4,
        },
      });

      expect(result[0]).not.toHaveProperty('items');
    });
  });

  describe('findById', () => {
    it('returns job details with copied items', () => {
      const items = [
        createItem('item-1', 'https://example.com', UrlCheckStatus.SUCCESS),
        createItem('item-2', 'https://example.org', UrlCheckStatus.ERROR),
      ];

      const job: Job = {
        id: 'job-1',
        createdAt: '2026-07-26T12:00:00.000Z',
        startedAt: '2026-07-26T12:01:00.000Z',
        finishedAt: '2026-07-26T12:02:00.000Z',
        status: JobStatus.COMPLETED,
        items,
        failureMessage: null,
      };

      findJobByIdMock.mockReturnValue(job);

      const result = service.findById(job.id);

      expect(findJobByIdMock).toHaveBeenCalledTimes(1);
      expect(findJobByIdMock).toHaveBeenCalledWith(job.id);

      expect(result).toEqual({
        id: job.id,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        status: job.status,
        statistics: {
          total: 2,
          pending: 0,
          inProgress: 0,
          success: 1,
          error: 1,
          cancelled: 0,
          processed: 2,
        },
        items,
        failureMessage: job.failureMessage,
      });

      expect(result.items).not.toBe(job.items);
      expect(result.items[0]).not.toBe(job.items[0]);
      expect(result.items[1]).not.toBe(job.items[1]);
    });

    it('throws NotFoundException when the job does not exist', () => {
      const missingId = 'unknown-id';

      findJobByIdMock.mockReturnValue(undefined);

      let thrownError: unknown;

      try {
        service.findById(missingId);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(findJobByIdMock).toHaveBeenCalledTimes(1);
      expect(findJobByIdMock).toHaveBeenCalledWith(missingId);
      expect(thrownError).toBeInstanceOf(NotFoundException);

      if (!(thrownError instanceof Error)) {
        throw new Error('Expected findById to throw an Error instance');
      }

      expect(thrownError.message).toBe(
        `Job with id ${missingId} was not found`,
      );
    });
  });
});
