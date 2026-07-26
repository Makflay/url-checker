import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONCURRENT_URL_CHECKS } from '../constants/processor.constants';
import { JobStatus } from '../enums/job-status.enum';
import { UrlCheckStatus } from '../enums/url-check-status.enum';
import { HttpClientService } from '../http/http-client.service';
import type { JobItem } from '../interfaces/job-item.interface';
import type { Job } from '../interfaces/job.interface';
import { JobsRepository } from '../repositories/jobs.repository';
import { JobsProcessor } from './jobs.processor';

function createPendingJob(id: string, itemCount: number): Job {
  const items: JobItem[] = Array.from(
    { length: itemCount },
    (_, index): JobItem => ({
      id: `${id}-item-${index + 1}`,
      url: `https://example-${index + 1}.com`,
      status: UrlCheckStatus.PENDING,
      httpStatus: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    }),
  );

  return {
    id,
    createdAt: '2026-07-26T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    status: JobStatus.PENDING,
    items,
    failureMessage: null,
  };
}

describe('JobsProcessor', () => {
  let repository: JobsRepository;
  let httpClientService: HttpClientService;
  let processor: JobsProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    repository = new JobsRepository();
    httpClientService = new HttpClientService();
    processor = new JobsProcessor(repository, httpClientService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function finishProcessing(
    processingPromise: Promise<void>,
  ): Promise<void> {
    await vi.runAllTimersAsync();
    await processingPromise;
  }

  it('completes a job with successful URL checks', async () => {
    const job = createPendingJob('job-1', 3);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: 200,
      errorMessage: null,
    });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    const completedJob = repository.findById(job.id);

    expect(completedJob).toBeDefined();
    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
    expect(completedJob?.startedAt).not.toBeNull();
    expect(completedJob?.finishedAt).not.toBeNull();
    expect(completedJob?.failureMessage).toBeNull();

    completedJob?.items.forEach((item) => {
      expect(item.status).toBe(UrlCheckStatus.SUCCESS);
      expect(item.httpStatus).toBe(200);
      expect(item.errorMessage).toBeNull();
      expect(item.startedAt).not.toBeNull();
      expect(item.finishedAt).not.toBeNull();
      expect(item.durationMs).not.toBeNull();
      expect(item.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('keeps the job completed when one URL has a network error', async () => {
    const job = createPendingJob('job-2', 2);
    repository.create(job);

    vi.spyOn(httpClientService, 'check')
      .mockResolvedValueOnce({
        httpStatus: 200,
        errorMessage: null,
      })
      .mockResolvedValueOnce({
        httpStatus: null,
        errorMessage: 'HTTP request failed',
      });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    const completedJob = repository.findById(job.id);
    const errorItem = completedJob?.items.find(
      (item) => item.status === UrlCheckStatus.ERROR,
    );

    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
    expect(errorItem).toBeDefined();
    expect(errorItem?.httpStatus).toBeNull();
    expect(errorItem?.errorMessage).toBe('HTTP request failed');
  });

  it('treats HTTP 404 as a successful URL check', async () => {
    const job = createPendingJob('job-3', 1);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: 404,
      errorMessage: null,
    });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    const completedJob = repository.findById(job.id);
    const item = completedJob?.items[0];

    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
    expect(item?.status).toBe(UrlCheckStatus.SUCCESS);
    expect(item?.httpStatus).toBe(404);
    expect(item?.errorMessage).toBeNull();
  });

  it('limits concurrency to five URL checks per job', async () => {
    const job = createPendingJob('job-4', 12);
    repository.create(job);

    let activeRequests = 0;
    let maxActiveRequests = 0;
    let releaseChecks: () => void = () => undefined;

    const checkGate = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        await checkGate;

        activeRequests -= 1;

        return {
          httpStatus: 200,
          errorMessage: null,
        };
      });

    const processingPromise = processor.process(job.id);

    expect(checkMock).toHaveBeenCalledTimes(MAX_CONCURRENT_URL_CHECKS);
    expect(maxActiveRequests).toBe(MAX_CONCURRENT_URL_CHECKS);

    releaseChecks();

    await finishProcessing(processingPromise);

    expect(checkMock).toHaveBeenCalledTimes(job.items.length);
    expect(maxActiveRequests).toBeLessThanOrEqual(MAX_CONCURRENT_URL_CHECKS);
    expect(repository.findById(job.id)?.status).toBe(JobStatus.COMPLETED);
  });

  it('processes different jobs independently', async () => {
    const firstJob = createPendingJob('job-a', 2);
    const secondJob = createPendingJob('job-b', 2);

    repository.create(firstJob);
    repository.create(secondJob);

    const checkMock = vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: 204,
      errorMessage: null,
    });

    const firstProcessing = processor.process(firstJob.id);
    const secondProcessing = processor.process(secondJob.id);

    await vi.runAllTimersAsync();
    await Promise.all([firstProcessing, secondProcessing]);

    expect(checkMock).toHaveBeenCalledTimes(4);
    expect(repository.findById(firstJob.id)?.status).toBe(JobStatus.COMPLETED);
    expect(repository.findById(secondJob.id)?.status).toBe(JobStatus.COMPLETED);
  });

  it('marks the job as failed after an unexpected error', async () => {
    const job = createPendingJob('job-5', 1);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockRejectedValue(
      new Error('Unexpected internal failure'),
    );

    await expect(processor.process(job.id)).resolves.toBeUndefined();

    const failedJob = repository.findById(job.id);

    expect(failedJob?.status).toBe(JobStatus.FAILED);
    expect(failedJob?.finishedAt).not.toBeNull();
    expect(failedJob?.failureMessage).toBe('Job processing failed');
  });

  it('safely ignores an unknown job ID', async () => {
    const checkMock = vi.spyOn(httpClientService, 'check');

    await expect(processor.process('unknown-id')).resolves.toBeUndefined();

    expect(checkMock).not.toHaveBeenCalled();
  });

  it('does not process a job that is not pending', async () => {
    const completedJob: Job = {
      ...createPendingJob('job-6', 1),
      status: JobStatus.COMPLETED,
      startedAt: '2026-07-26T12:00:00.000Z',
      finishedAt: '2026-07-26T12:01:00.000Z',
    };

    repository.create(completedJob);

    const checkMock = vi.spyOn(httpClientService, 'check');

    await processor.process(completedJob.id);

    expect(checkMock).not.toHaveBeenCalled();
    expect(repository.findById(completedJob.id)).toEqual(completedJob);
  });
});
