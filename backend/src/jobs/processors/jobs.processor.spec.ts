import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONCURRENT_URL_CHECKS } from '../constants/processor.constants';
import { JobStatus } from '../enums/job-status.enum';
import { UrlCheckStatus } from '../enums/url-check-status.enum';
import { HttpClientService } from '../http/http-client.service';
import type { JobItem } from '../interfaces/job-item.interface';
import type { Job } from '../interfaces/job.interface';
import type { HttpCheckResult } from '../http/http-check-result.interface';
import { JobsRepository } from '../repositories/jobs.repository';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from '../jobs.service';

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
  let service: JobsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    repository = new JobsRepository();
    httpClientService = new HttpClientService();
    processor = new JobsProcessor(repository, httpClientService);
    service = new JobsService(repository, processor);
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

  it('completes a normal job', async () => {
    const job = createPendingJob('job-1', 3);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: 200,
      errorMessage: null,
    });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    expect(repository.findById(job.id)?.status).toBe(JobStatus.COMPLETED);
  });

  it('does not start new URLs after cancellation', async () => {
    const job = createPendingJob('job-2', 8);
    repository.create(job);

    let releaseChecks: () => void = () => undefined;

    const checkGate = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation(async () => {
        await checkGate;

        return {
          httpStatus: 200,
          errorMessage: null,
        };
      });

    const processingPromise = processor.process(job.id);

    expect(checkMock).toHaveBeenCalledTimes(MAX_CONCURRENT_URL_CHECKS);

    service.cancel(job.id);

    const cancelledDuringProcessing = repository.findById(job.id);

    expect(cancelledDuringProcessing?.status).toBe(JobStatus.CANCELLED);
    expect(
      cancelledDuringProcessing?.items.filter(
        (item) => item.status === UrlCheckStatus.CANCELLED,
      ),
    ).toHaveLength(job.items.length - MAX_CONCURRENT_URL_CHECKS);

    releaseChecks();

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);

    expect(checkMock).toHaveBeenCalledTimes(MAX_CONCURRENT_URL_CHECKS);
    expect(finalJob?.status).toBe(JobStatus.CANCELLED);

    const successfulItems = finalJob?.items.filter(
      (item) => item.status === UrlCheckStatus.SUCCESS,
    );

    const cancelledItems = finalJob?.items.filter(
      (item) => item.status === UrlCheckStatus.CANCELLED,
    );

    expect(successfulItems).toHaveLength(MAX_CONCURRENT_URL_CHECKS);
    expect(cancelledItems).toHaveLength(
      job.items.length - MAX_CONCURRENT_URL_CHECKS,
    );
  });

  it('allows an in-progress URL to finish after cancellation', async () => {
    const job = createPendingJob('job-3', 1);
    repository.create(job);

    let resolveCheck: (result: HttpCheckResult) => void = () => undefined;

    const pendingCheck = new Promise<HttpCheckResult>((resolve) => {
      resolveCheck = resolve;
    });

    vi.spyOn(httpClientService, 'check').mockReturnValue(pendingCheck);

    const processingPromise = processor.process(job.id);

    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );

    service.cancel(job.id);

    resolveCheck({
      httpStatus: 404,
      errorMessage: null,
    });

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);
    const finalItem = finalJob?.items[0];

    expect(finalJob?.status).toBe(JobStatus.CANCELLED);
    expect(finalItem?.status).toBe(UrlCheckStatus.SUCCESS);
    expect(finalItem?.httpStatus).toBe(404);
  });

  it('does not overwrite an item cancelled before processing', async () => {
    const job = createPendingJob('job-4', 1);
    repository.create(job);

    service.cancel(job.id);

    const checkMock = vi.spyOn(httpClientService, 'check');

    await processor.process(job.id);

    expect(checkMock).not.toHaveBeenCalled();
    expect(repository.findById(job.id)?.status).toBe(JobStatus.CANCELLED);
    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.CANCELLED,
    );
  });

  it('does not change cancelled to completed', async () => {
    const job = createPendingJob('job-5', 1);
    repository.create(job);

    let resolveCheck: (result: HttpCheckResult) => void = () => undefined;

    const pendingCheck = new Promise<HttpCheckResult>((resolve) => {
      resolveCheck = resolve;
    });

    vi.spyOn(httpClientService, 'check').mockReturnValue(pendingCheck);

    const updateJobSpy = vi.spyOn(repository, 'update');

    const processingPromise = processor.process(job.id);

    service.cancel(job.id);

    resolveCheck({
      httpStatus: 200,
      errorMessage: null,
    });

    await finishProcessing(processingPromise);

    const statusUpdates = updateJobSpy.mock.calls.map(
      ([, updatedJob]) => updatedJob.status,
    );

    const cancelledIndex = statusUpdates.indexOf(JobStatus.CANCELLED);

    expect(cancelledIndex).toBeGreaterThanOrEqual(0);
    expect(statusUpdates.slice(cancelledIndex + 1)).not.toContain(
      JobStatus.COMPLETED,
    );
    expect(repository.findById(job.id)?.status).toBe(JobStatus.CANCELLED);
  });

  it('does not change cancelled to failed', async () => {
    const job = createPendingJob('job-6', 1);
    repository.create(job);

    let rejectCheck: (reason?: unknown) => void = () => undefined;

    const pendingCheck = new Promise<HttpCheckResult>((_resolve, reject) => {
      rejectCheck = reject;
    });

    vi.spyOn(httpClientService, 'check').mockReturnValue(pendingCheck);

    const processingPromise = processor.process(job.id);

    service.cancel(job.id);
    rejectCheck(new Error('Unexpected processing error'));

    await expect(processingPromise).resolves.toBeUndefined();

    expect(repository.findById(job.id)?.status).toBe(JobStatus.CANCELLED);
    expect(repository.findById(job.id)?.failureMessage).toBeNull();
  });

  it('keeps a network error local to the URL', async () => {
    const job = createPendingJob('job-7', 1);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: null,
      errorMessage: 'HTTP request failed',
    });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);

    expect(finalJob?.status).toBe(JobStatus.COMPLETED);
    expect(finalJob?.items[0]?.status).toBe(UrlCheckStatus.ERROR);
  });

  it('marks a non-cancelled job as failed after a system error', async () => {
    const job = createPendingJob('job-8', 1);
    repository.create(job);

    vi.spyOn(httpClientService, 'check').mockRejectedValue(
      new Error('Unexpected system error'),
    );

    await expect(processor.process(job.id)).resolves.toBeUndefined();

    expect(repository.findById(job.id)?.status).toBe(JobStatus.FAILED);
    expect(repository.findById(job.id)?.failureMessage).toBe(
      'Job processing failed',
    );
  });

  it('limits normal processing to five checks', async () => {
    const job = createPendingJob('job-9', 12);
    repository.create(job);

    let activeRequests = 0;
    let maxActiveRequests = 0;
    let releaseChecks: () => void = () => undefined;

    const gate = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        await gate;
        activeRequests -= 1;

        return {
          httpStatus: 200,
          errorMessage: null,
        };
      });

    const processingPromise = processor.process(job.id);

    expect(checkMock).toHaveBeenCalledTimes(MAX_CONCURRENT_URL_CHECKS);

    releaseChecks();

    await finishProcessing(processingPromise);

    expect(checkMock).toHaveBeenCalledTimes(12);
    expect(maxActiveRequests).toBeLessThanOrEqual(MAX_CONCURRENT_URL_CHECKS);
  });
});
