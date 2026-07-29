import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import { JobStatus } from './enums/job-status.enum';
import { UrlCheckStatus } from './enums/url-check-status.enum';
import type { JobItem } from './interfaces/job-item.interface';
import type { Job } from './interfaces/job.interface';
import { JobsProcessor } from './processors/jobs.processor';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './jobs.service';

function createItem(id: string, status: UrlCheckStatus): JobItem {
  return {
    id,
    url: `https://${id}.example.com`,
    status,
    httpStatus: status === UrlCheckStatus.SUCCESS ? 200 : null,
    errorMessage:
      status === UrlCheckStatus.ERROR ? 'HTTP request failed' : null,
    startedAt:
      status === UrlCheckStatus.PENDING || status === UrlCheckStatus.CANCELLED
        ? null
        : '2026-07-26T12:01:00.000Z',
    finishedAt:
      status === UrlCheckStatus.SUCCESS ||
      status === UrlCheckStatus.ERROR ||
      status === UrlCheckStatus.CANCELLED
        ? '2026-07-26T12:01:01.000Z'
        : null,
    durationMs:
      status === UrlCheckStatus.SUCCESS || status === UrlCheckStatus.ERROR
        ? 1_000
        : status === UrlCheckStatus.CANCELLED
          ? 0
          : null,
  };
}

function createJob(status: JobStatus, items: JobItem[]): Job {
  const hasStarted = status !== JobStatus.PENDING;

  return {
    id: 'job-1',
    createdAt: '2026-07-26T12:00:00.000Z',
    startedAt: hasStarted ? '2026-07-26T12:01:00.000Z' : null,
    finishedAt:
      status === JobStatus.COMPLETED ||
      status === JobStatus.CANCELLED ||
      status === JobStatus.FAILED
        ? '2026-07-26T12:02:00.000Z'
        : null,
    status,
    items,
    failureMessage:
      status === JobStatus.FAILED ? 'Job processing failed' : null,
  };
}

describe('JobsService', () => {
  let service: JobsService;

  let createJobMock: MockedFunction<JobsRepository['create']>;

  let findAllJobsMock: MockedFunction<JobsRepository['findAll']>;

  let findJobByIdMock: MockedFunction<JobsRepository['findById']>;

  let updateJobMock: MockedFunction<JobsRepository['update']>;

  let processJobMock: MockedFunction<JobsProcessor['process']>;

  beforeEach(async () => {
    createJobMock = vi.fn((job: Job): Job => job);
    findAllJobsMock = vi.fn((): Job[] => []);
    findJobByIdMock = vi.fn((_id: string): Job | undefined => undefined);
    updateJobMock = vi.fn((_id: string, job: Job): Job => job);
    processJobMock = vi.fn((_id: string): Promise<void> => Promise.resolve());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: JobsRepository,
          useValue: {
            create: createJobMock,
            findAll: findAllJobsMock,
            findById: findJobByIdMock,
            update: updateJobMock,
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
    it('creates and saves a pending job with one pending item for every URL', () => {
      const calls: string[] = [];
      const processingPromise = new Promise<void>(() => undefined);
      const urls = ['https://first.example.com', 'https://second.example.com'];

      createJobMock.mockImplementation((job: Job): Job => {
        calls.push('repository');
        return job;
      });

      processJobMock.mockImplementation((): Promise<void> => {
        calls.push('processor');
        return processingPromise;
      });

      const result = service.create({ urls });

      expect(result).not.toBeInstanceOf(Promise);
      expect(result.jobId).not.toBe('');
      expect(calls).toEqual(['repository', 'processor']);
      expect(createJobMock).toHaveBeenCalledTimes(1);
      expect(processJobMock).toHaveBeenCalledWith(result.jobId);

      const savedJob = createJobMock.mock.calls[0]?.[0];

      expect(savedJob).toBeDefined();

      if (!savedJob) {
        throw new Error('Expected repository.create to receive a job');
      }

      expect(savedJob.id).toBe(result.jobId);
      expect(savedJob.status).toBe(JobStatus.PENDING);
      expect(savedJob.createdAt).not.toBe('');
      expect(Number.isNaN(Date.parse(savedJob.createdAt))).toBe(false);
      expect(savedJob.startedAt).toBeNull();
      expect(savedJob.finishedAt).toBeNull();
      expect(savedJob.failureMessage).toBeNull();
      expect(savedJob.items).toHaveLength(urls.length);
      expect(savedJob.items.map((item) => item.url)).toEqual(urls);

      const itemIds = savedJob.items.map((item) => item.id);

      expect(new Set(itemIds).size).toBe(itemIds.length);

      savedJob.items.forEach((item) => {
        expect(item.id).not.toBe('');
        expect(item.status).toBe(UrlCheckStatus.PENDING);
        expect(item.httpStatus).toBeNull();
        expect(item.errorMessage).toBeNull();
        expect(item.startedAt).toBeNull();
        expect(item.finishedAt).toBeNull();
        expect(item.durationMs).toBeNull();
      });
    });

    it('creates distinct job and item identifiers for separate jobs', () => {
      service.create({
        urls: [
          'https://first-job-one.example.com',
          'https://first-job-two.example.com',
        ],
      });

      service.create({
        urls: [
          'https://second-job-one.example.com',
          'https://second-job-two.example.com',
        ],
      });

      expect(createJobMock).toHaveBeenCalledTimes(2);

      const firstJob = createJobMock.mock.calls[0]?.[0];
      const secondJob = createJobMock.mock.calls[1]?.[0];

      expect(firstJob).toBeDefined();
      expect(secondJob).toBeDefined();

      if (!firstJob || !secondJob) {
        throw new Error('Expected repository.create to receive both jobs');
      }

      expect(firstJob.id).not.toBe(secondJob.id);

      const firstItemIds = new Set(firstJob.items.map((item) => item.id));

      const secondItemIds = secondJob.items.map((item) => item.id);

      secondItemIds.forEach((itemId) => {
        expect(firstItemIds.has(itemId)).toBe(false);
      });
    });

    it('does not start processing when saving fails', () => {
      createJobMock.mockImplementation(() => {
        throw new Error('Repository create failed');
      });

      expect(() =>
        service.create({
          urls: ['https://example.com'],
        }),
      ).toThrow('Repository create failed');

      expect(processJobMock).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns details for an existing job', () => {
      const job = createJob(JobStatus.PENDING, [
        createItem('item-1', UrlCheckStatus.PENDING),
      ]);

      findJobByIdMock.mockReturnValue(job);

      expect(service.findById(job.id).id).toBe(job.id);
    });

    it('throws for an unknown job', () => {
      findJobByIdMock.mockReturnValue(undefined);

      expect(() => service.findById('unknown-id')).toThrow(NotFoundException);
    });
  });

  describe('statistics', () => {
    it('returns consistent summary and details statistics for mixed item statuses', () => {
      const job = createJob(JobStatus.CANCELLED, [
        createItem('success', UrlCheckStatus.SUCCESS),
        createItem('error', UrlCheckStatus.ERROR),
        createItem('cancelled', UrlCheckStatus.CANCELLED),
      ]);

      findAllJobsMock.mockReturnValue([job]);
      findJobByIdMock.mockReturnValue(job);

      const summaries = service.findAll();
      const details = service.findById(job.id);

      expect(summaries).toHaveLength(1);

      const summary = summaries[0];

      expect(summary).toBeDefined();

      if (!summary) {
        throw new Error('Expected one job summary');
      }

      const expectedStatistics = {
        total: 3,
        pending: 0,
        inProgress: 0,
        success: 1,
        error: 1,
        cancelled: 1,
        processed: 3,
      };

      expect(summary.id).toBe(job.id);
      expect(summary.createdAt).toBe(job.createdAt);
      expect(summary.status).toBe(JobStatus.CANCELLED);
      expect(summary.statistics).toEqual(expectedStatistics);

      expect(details.id).toBe(job.id);
      expect(details.status).toBe(JobStatus.CANCELLED);
      expect(details.createdAt).toBe(job.createdAt);
      expect(details.startedAt).toBe(job.startedAt);
      expect(details.finishedAt).toBe(job.finishedAt);
      expect(details.statistics).toEqual(expectedStatistics);
      expect(details.statistics).toEqual(summary.statistics);
      expect(details.statistics.processed).toBeLessThanOrEqual(
        details.statistics.total,
      );

      const countedItems =
        details.statistics.pending +
        details.statistics.inProgress +
        details.statistics.success +
        details.statistics.error +
        details.statistics.cancelled;

      expect(countedItems).toBe(details.statistics.total);
    });
  });

  describe('cancel', () => {
    it('cancels a pending job and its pending items', () => {
      const job = createJob(JobStatus.PENDING, [
        createItem('item-1', UrlCheckStatus.PENDING),
        createItem('item-2', UrlCheckStatus.PENDING),
      ]);

      findJobByIdMock.mockReturnValue(job);

      service.cancel(job.id);

      expect(updateJobMock).toHaveBeenCalledTimes(1);

      const cancelledJob = updateJobMock.mock.calls[0]?.[1];

      expect(cancelledJob).toBeDefined();

      if (!cancelledJob) {
        throw new Error('Expected repository.update to receive a job');
      }

      expect(cancelledJob.status).toBe(JobStatus.CANCELLED);
      expect(cancelledJob.startedAt).toBeNull();
      expect(cancelledJob.finishedAt).not.toBeNull();
      expect(cancelledJob.failureMessage).toBeNull();

      cancelledJob.items.forEach((item) => {
        expect(item.status).toBe(UrlCheckStatus.CANCELLED);
        expect(item.startedAt).toBeNull();
        expect(item.finishedAt).not.toBeNull();
        expect(item.durationMs).toBe(0);
        expect(item.httpStatus).toBeNull();
        expect(item.errorMessage).toBeNull();
      });
    });

    it('cancels only pending items in an in-progress job', () => {
      const job = createJob(JobStatus.IN_PROGRESS, [
        createItem('pending', UrlCheckStatus.PENDING),
        createItem('in-progress', UrlCheckStatus.IN_PROGRESS),
        createItem('success', UrlCheckStatus.SUCCESS),
        createItem('error', UrlCheckStatus.ERROR),
      ]);

      findJobByIdMock.mockReturnValue(job);

      service.cancel(job.id);

      const cancelledJob = updateJobMock.mock.calls[0]?.[1];

      expect(cancelledJob).toBeDefined();

      if (!cancelledJob) {
        throw new Error('Expected repository.update to receive a job');
      }

      expect(cancelledJob.status).toBe(JobStatus.CANCELLED);
      expect(cancelledJob.startedAt).toBe(job.startedAt);
      expect(cancelledJob.finishedAt).toBeNull();

      expect(cancelledJob.items[0]?.status).toBe(UrlCheckStatus.CANCELLED);
      expect(cancelledJob.items[1]).toEqual(job.items[1]);
      expect(cancelledJob.items[2]).toEqual(job.items[2]);
      expect(cancelledJob.items[3]).toEqual(job.items[3]);
    });

    it('is idempotent for an already cancelled job', () => {
      const job = createJob(JobStatus.CANCELLED, [
        createItem('item-1', UrlCheckStatus.CANCELLED),
      ]);

      findJobByIdMock.mockReturnValue(job);

      expect(() => service.cancel(job.id)).not.toThrow();
      expect(updateJobMock).not.toHaveBeenCalled();
    });

    it('rejects cancellation of a completed job', () => {
      const job = createJob(JobStatus.COMPLETED, [
        createItem('item-1', UrlCheckStatus.SUCCESS),
      ]);

      findJobByIdMock.mockReturnValue(job);

      expect(() => service.cancel(job.id)).toThrow(ConflictException);
      expect(() => service.cancel(job.id)).toThrow(
        `Job with id ${job.id} cannot be cancelled from status ${JobStatus.COMPLETED}`,
      );
      expect(updateJobMock).not.toHaveBeenCalled();
    });

    it('rejects cancellation of a failed job', () => {
      const job = createJob(JobStatus.FAILED, [
        createItem('item-1', UrlCheckStatus.ERROR),
      ]);

      findJobByIdMock.mockReturnValue(job);

      expect(() => service.cancel(job.id)).toThrow(ConflictException);
      expect(updateJobMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown ID', () => {
      findJobByIdMock.mockReturnValue(undefined);

      expect(() => service.cancel('unknown-id')).toThrow(NotFoundException);

      expect(updateJobMock).not.toHaveBeenCalled();
    });
  });
});
