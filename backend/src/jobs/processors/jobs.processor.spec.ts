import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobsConfig } from '../../config';
import { JobStatus } from '../enums/job-status.enum';
import { UrlCheckStatus } from '../enums/url-check-status.enum';
import { HttpClientService } from '../http/http-client.service';
import type { JobItem } from '../interfaces/job-item.interface';
import type { Job } from '../interfaces/job.interface';
import type { HttpCheckResult } from '../http/http-check-result.interface';
import { JobsRepository } from '../repositories/jobs.repository';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from '../jobs.service';

const testJobsConfig: JobsConfig = {
  headRequestTimeoutMs: 5000,
  maxConcurrency: 2,
  artificialDelay: {
    minMs: 0,
    maxMs: 0,
  },
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] = () => undefined;
  let reject: Deferred<T>['reject'] = () => undefined;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createPendingJob(id: string, itemCount: number): Job {
  const items: JobItem[] = Array.from(
    { length: itemCount },
    (_, index): JobItem => ({
      id: `${id}-item-${index + 1}`,
      url: `https://${id}-example-${index + 1}.com`,
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
    httpClientService = new HttpClientService(testJobsConfig);
    processor = new JobsProcessor(
      repository,
      httpClientService,
      testJobsConfig,
    );
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

  it('saves a successful URL result only after the artificial delay', async () => {
    const delayedConfig: JobsConfig = {
      ...testJobsConfig,
      maxConcurrency: 1,
      artificialDelay: {
        minMs: 1_000,
        maxMs: 1_000,
      },
    };

    const delayedProcessor = new JobsProcessor(
      repository,
      httpClientService,
      delayedConfig,
    );

    const job = createPendingJob('job-success-delay', 1);
    repository.create(job);

    const checkMock = vi.spyOn(httpClientService, 'check').mockResolvedValue({
      httpStatus: 204,
      errorMessage: null,
    });

    const processingPromise = delayedProcessor.process(job.id);

    expect(checkMock).toHaveBeenCalledWith(job.items[0]?.url);
    expect(repository.findById(job.id)?.status).toBe(JobStatus.IN_PROGRESS);
    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );
    expect(repository.findById(job.id)?.items[0]?.finishedAt).toBeNull();
    expect(repository.findById(job.id)?.items[0]?.durationMs).toBeNull();

    await vi.advanceTimersByTimeAsync(999);

    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );
    expect(repository.findById(job.id)?.items[0]?.httpStatus).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await processingPromise;

    const completedJob = repository.findById(job.id);
    const completedItem = completedJob?.items[0];

    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
    expect(completedJob?.startedAt).not.toBeNull();
    expect(completedJob?.finishedAt).not.toBeNull();
    expect(completedJob?.failureMessage).toBeNull();

    expect(completedItem?.status).toBe(UrlCheckStatus.SUCCESS);
    expect(completedItem?.httpStatus).toBe(204);
    expect(completedItem?.errorMessage).toBeNull();
    expect(completedItem?.startedAt).not.toBeNull();
    expect(completedItem?.finishedAt).not.toBeNull();
    expect(completedItem?.durationMs).toBe(1_000);

    if (
      completedItem?.startedAt !== null &&
      completedItem?.startedAt !== undefined &&
      completedItem.finishedAt !== null &&
      completedItem.finishedAt !== undefined
    ) {
      expect(
        Date.parse(completedItem.finishedAt) -
          Date.parse(completedItem.startedAt),
      ).toBe(completedItem.durationMs);
    }
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

    expect(checkMock).toHaveBeenCalledTimes(testJobsConfig.maxConcurrency);

    service.cancel(job.id);

    const cancelledDuringProcessing = repository.findById(job.id);

    expect(cancelledDuringProcessing?.status).toBe(JobStatus.CANCELLED);
    expect(
      cancelledDuringProcessing?.items.filter(
        (item) => item.status === UrlCheckStatus.CANCELLED,
      ),
    ).toHaveLength(job.items.length - testJobsConfig.maxConcurrency);

    releaseChecks();

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);

    expect(checkMock).toHaveBeenCalledTimes(testJobsConfig.maxConcurrency);
    expect(finalJob?.status).toBe(JobStatus.CANCELLED);

    const successfulItems = finalJob?.items.filter(
      (item) => item.status === UrlCheckStatus.SUCCESS,
    );

    const cancelledItems = finalJob?.items.filter(
      (item) => item.status === UrlCheckStatus.CANCELLED,
    );

    expect(successfulItems).toHaveLength(testJobsConfig.maxConcurrency);
    expect(cancelledItems).toHaveLength(
      job.items.length - testJobsConfig.maxConcurrency,
    );
  });

  it('finalizes a cancelled job after its already-started URLs finish', async () => {
    const job = createPendingJob('job-cancel-finalization', 1);
    repository.create(job);

    const pendingCheck = createDeferred<HttpCheckResult>();

    vi.spyOn(httpClientService, 'check').mockReturnValue(pendingCheck.promise);

    const processingPromise = processor.process(job.id);

    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );

    service.cancel(job.id);

    const cancelledWhileActive = repository.findById(job.id);

    expect(cancelledWhileActive?.status).toBe(JobStatus.CANCELLED);
    expect(cancelledWhileActive?.finishedAt).toBeNull();
    expect(cancelledWhileActive?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );

    await vi.advanceTimersByTimeAsync(100);

    pendingCheck.resolve({
      httpStatus: 404,
      errorMessage: null,
    });

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);
    const finalItem = finalJob?.items[0];

    expect(finalJob?.status).toBe(JobStatus.CANCELLED);
    expect(finalJob?.status).not.toBe(JobStatus.COMPLETED);
    expect(finalJob?.status).not.toBe(JobStatus.FAILED);
    expect(finalJob?.finishedAt).not.toBeNull();

    expect(finalItem?.status).toBe(UrlCheckStatus.SUCCESS);
    expect(finalItem?.httpStatus).toBe(404);
    expect(finalItem?.finishedAt).not.toBeNull();
    expect(finalItem?.durationMs).toBeGreaterThanOrEqual(100);

    if (finalJob?.finishedAt && finalItem?.finishedAt) {
      expect(Date.parse(finalJob.finishedAt)).toBeGreaterThanOrEqual(
        Date.parse(finalItem.finishedAt),
      );
    }
  });

  it('cancelling one job does not stop another concurrently processing job', async () => {
    const firstJob = createPendingJob('cancel-isolation-a', 4);
    const secondJob = createPendingJob('cancel-isolation-b', 4);

    repository.create(firstJob);
    repository.create(secondJob);

    const firstGate = createDeferred<void>();
    const secondGate = createDeferred<void>();

    let firstCalls = 0;
    let secondCalls = 0;

    vi.spyOn(httpClientService, 'check').mockImplementation(async (url) => {
      if (url.includes('cancel-isolation-a')) {
        firstCalls += 1;
        await firstGate.promise;
      } else {
        secondCalls += 1;
        await secondGate.promise;
      }

      return {
        httpStatus: 200,
        errorMessage: null,
      };
    });

    const firstProcessing = processor.process(firstJob.id);
    const secondProcessing = processor.process(secondJob.id);

    expect(firstCalls).toBe(testJobsConfig.maxConcurrency);
    expect(secondCalls).toBe(testJobsConfig.maxConcurrency);

    service.cancel(firstJob.id);

    expect(repository.findById(firstJob.id)?.status).toBe(JobStatus.CANCELLED);
    expect(repository.findById(secondJob.id)?.status).toBe(
      JobStatus.IN_PROGRESS,
    );

    firstGate.resolve();

    await vi.runAllTimersAsync();
    await firstProcessing;

    expect(firstCalls).toBe(testJobsConfig.maxConcurrency);
    expect(repository.findById(firstJob.id)?.status).toBe(JobStatus.CANCELLED);

    expect(secondCalls).toBe(testJobsConfig.maxConcurrency);
    expect(repository.findById(secondJob.id)?.status).toBe(
      JobStatus.IN_PROGRESS,
    );

    secondGate.resolve();

    await finishProcessing(secondProcessing);

    expect(secondCalls).toBe(secondJob.items.length);
    expect(repository.findById(secondJob.id)?.status).toBe(JobStatus.COMPLETED);
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

  it('completes the job after preserving successful and transport-error URL results', async () => {
    const job = createPendingJob('job-mixed-results', 2);
    repository.create(job);

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation((url) => {
        if (url === job.items[0]?.url) {
          return Promise.resolve({
            httpStatus: 200,
            errorMessage: null,
          });
        }

        return Promise.resolve({
          httpStatus: null,
          errorMessage: 'HTTP request failed',
        });
      });

    const processingPromise = processor.process(job.id);

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);
    const successfulItem = finalJob?.items[0];
    const errorItem = finalJob?.items[1];

    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(checkMock).toHaveBeenCalledWith(job.items[0]?.url);
    expect(checkMock).toHaveBeenCalledWith(job.items[1]?.url);

    expect(finalJob?.status).toBe(JobStatus.COMPLETED);
    expect(finalJob?.status).not.toBe(JobStatus.FAILED);
    expect(finalJob?.failureMessage).toBeNull();
    expect(finalJob?.finishedAt).not.toBeNull();

    expect(successfulItem?.status).toBe(UrlCheckStatus.SUCCESS);
    expect(successfulItem?.httpStatus).toBe(200);
    expect(successfulItem?.errorMessage).toBeNull();
    expect(successfulItem?.startedAt).not.toBeNull();
    expect(successfulItem?.finishedAt).not.toBeNull();
    expect(successfulItem?.durationMs).toBeGreaterThanOrEqual(0);

    expect(errorItem?.status).toBe(UrlCheckStatus.ERROR);
    expect(errorItem?.httpStatus).toBeNull();
    expect(errorItem?.errorMessage).toBe('HTTP request failed');
    expect(errorItem?.startedAt).not.toBeNull();
    expect(errorItem?.finishedAt).not.toBeNull();
    expect(errorItem?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('finalizes every unfinished item when the job processor fails', async () => {
    const job = createPendingJob('job-failure-finalization', 3);
    repository.create(job);

    const secondCheck = createDeferred<HttpCheckResult>();

    vi.spyOn(httpClientService, 'check').mockImplementation((url) => {
      if (url === job.items[0]?.url) {
        return Promise.reject(new Error('Unexpected system error'));
      }

      return secondCheck.promise;
    });

    await expect(processor.process(job.id)).resolves.toBeUndefined();

    const failedJob = repository.findById(job.id);
    const details = service.findById(job.id);

    expect(failedJob?.status).toBe(JobStatus.FAILED);
    expect(failedJob?.finishedAt).not.toBeNull();
    expect(failedJob?.failureMessage).toBe('Job processing failed');

    expect(failedJob?.items).toHaveLength(3);
    expect(
      failedJob?.items.some(
        (item) =>
          item.status === UrlCheckStatus.PENDING ||
          item.status === UrlCheckStatus.IN_PROGRESS,
      ),
    ).toBe(false);

    failedJob?.items.forEach((item) => {
      expect(item.status).toBe(UrlCheckStatus.ERROR);
      expect(item.httpStatus).toBeNull();
      expect(item.errorMessage).toBe('Job processing failed');
      expect(item.finishedAt).toBe(failedJob.finishedAt);
      expect(item.durationMs).not.toBeNull();
      expect(item.durationMs).toBeGreaterThanOrEqual(0);
    });

    expect(failedJob?.items[2]?.startedAt).toBeNull();
    expect(failedJob?.items[2]?.durationMs).toBe(0);

    expect(details.statistics).toEqual({
      total: 3,
      pending: 0,
      inProgress: 0,
      success: 0,
      error: 3,
      cancelled: 0,
      processed: 3,
    });

    secondCheck.resolve({
      httpStatus: 200,
      errorMessage: null,
    });

    await vi.runAllTimersAsync();
  });

  it('ignores a late URL result after the job has failed', async () => {
    const job = createPendingJob('job-late-result-after-failure', 2);
    repository.create(job);

    const failingCheck = createDeferred<HttpCheckResult>();
    const lateCheck = createDeferred<HttpCheckResult>();

    vi.spyOn(httpClientService, 'check').mockImplementation((url) => {
      if (url === job.items[0]?.url) {
        return failingCheck.promise;
      }

      return lateCheck.promise;
    });

    const processingPromise = processor.process(job.id);

    expect(repository.findById(job.id)?.items[0]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );
    expect(repository.findById(job.id)?.items[1]?.status).toBe(
      UrlCheckStatus.IN_PROGRESS,
    );

    failingCheck.reject(new Error('Unexpected system error'));

    await processingPromise;

    const failedSnapshot = repository.findById(job.id);
    const failedDetails = service.findById(job.id);

    expect(failedSnapshot?.status).toBe(JobStatus.FAILED);
    expect(failedSnapshot?.finishedAt).not.toBeNull();
    expect(failedSnapshot?.failureMessage).toBe('Job processing failed');
    expect(failedDetails.statistics).toEqual({
      total: 2,
      pending: 0,
      inProgress: 0,
      success: 0,
      error: 2,
      cancelled: 0,
      processed: 2,
    });

    const failedFinishedAt = failedSnapshot?.finishedAt;
    const failedItems = failedSnapshot?.items.map((item) => ({
      ...item,
    }));

    await vi.advanceTimersByTimeAsync(500);

    lateCheck.resolve({
      httpStatus: 200,
      errorMessage: null,
    });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const finalJob = repository.findById(job.id);
    const finalDetails = service.findById(job.id);

    expect(finalJob?.status).toBe(JobStatus.FAILED);
    expect(finalJob?.finishedAt).toBe(failedFinishedAt);
    expect(finalJob?.failureMessage).toBe('Job processing failed');
    expect(finalJob?.items).toEqual(failedItems);
    expect(
      finalJob?.items.some((item) => item.status === UrlCheckStatus.SUCCESS),
    ).toBe(false);

    expect(finalDetails.statistics).toEqual({
      total: 2,
      pending: 0,
      inProgress: 0,
      success: 0,
      error: 2,
      cancelled: 0,
      processed: 2,
    });
  });

  it('limits one job to five active HEAD requests and processes every URL', async () => {
    const fiveWorkerConfig: JobsConfig = {
      ...testJobsConfig,
      maxConcurrency: 5,
    };

    const fiveWorkerProcessor = new JobsProcessor(
      repository,
      httpClientService,
      fiveWorkerConfig,
    );

    const job = createPendingJob('job-five-workers', 12);
    repository.create(job);

    const gate = createDeferred<void>();

    let activeRequests = 0;
    let maxActiveRequests = 0;

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        await gate.promise;

        activeRequests -= 1;

        return {
          httpStatus: 200,
          errorMessage: null,
        };
      });

    const processingPromise = fiveWorkerProcessor.process(job.id);

    expect(checkMock).toHaveBeenCalledTimes(5);
    expect(activeRequests).toBe(5);
    expect(maxActiveRequests).toBe(5);
    expect(maxActiveRequests).toBeLessThanOrEqual(5);

    gate.resolve();

    await finishProcessing(processingPromise);

    const finalJob = repository.findById(job.id);

    expect(checkMock).toHaveBeenCalledTimes(12);
    expect(maxActiveRequests).toBe(5);
    expect(finalJob?.status).toBe(JobStatus.COMPLETED);
    expect(
      finalJob?.items.every((item) => item.status === UrlCheckStatus.SUCCESS),
    ).toBe(true);
  });

  it('processes two jobs concurrently with an independent concurrency limit per job', async () => {
    const fiveWorkerConfig: JobsConfig = {
      ...testJobsConfig,
      maxConcurrency: 5,
    };

    const fiveWorkerProcessor = new JobsProcessor(
      repository,
      httpClientService,
      fiveWorkerConfig,
    );

    const firstJob = createPendingJob('concurrent-a', 6);
    const secondJob = createPendingJob('concurrent-b', 6);

    repository.create(firstJob);
    repository.create(secondJob);

    const firstGate = createDeferred<void>();
    const secondGate = createDeferred<void>();

    let firstActive = 0;
    let secondActive = 0;
    let firstMaximum = 0;
    let secondMaximum = 0;

    const checkMock = vi
      .spyOn(httpClientService, 'check')
      .mockImplementation(async (url) => {
        const isFirstJob = url.includes('concurrent-a');

        if (isFirstJob) {
          firstActive += 1;
          firstMaximum = Math.max(firstMaximum, firstActive);

          await firstGate.promise;

          firstActive -= 1;
        } else {
          secondActive += 1;
          secondMaximum = Math.max(secondMaximum, secondActive);

          await secondGate.promise;

          secondActive -= 1;
        }

        return {
          httpStatus: 200,
          errorMessage: null,
        };
      });

    const firstProcessing = fiveWorkerProcessor.process(firstJob.id);
    const secondProcessing = fiveWorkerProcessor.process(secondJob.id);

    expect(firstActive).toBe(5);
    expect(secondActive).toBe(5);
    expect(firstActive + secondActive).toBe(10);
    expect(firstMaximum).toBe(5);
    expect(secondMaximum).toBe(5);
    expect(checkMock).toHaveBeenCalledTimes(10);

    firstGate.resolve();

    await vi.runAllTimersAsync();
    await firstProcessing;

    expect(repository.findById(firstJob.id)?.status).toBe(JobStatus.COMPLETED);
    expect(repository.findById(secondJob.id)?.status).toBe(
      JobStatus.IN_PROGRESS,
    );
    expect(secondActive).toBe(5);

    secondGate.resolve();

    await finishProcessing(secondProcessing);

    expect(repository.findById(secondJob.id)?.status).toBe(JobStatus.COMPLETED);
    expect(checkMock).toHaveBeenCalledTimes(12);

    expect(
      repository
        .findById(firstJob.id)
        ?.items.every((item) => item.id.startsWith(firstJob.id)),
    ).toBe(true);

    expect(
      repository
        .findById(secondJob.id)
        ?.items.every((item) => item.id.startsWith(secondJob.id)),
    ).toBe(true);
  });
});
