import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { jobsConfig, type JobsConfig } from '../src/config';
import { JobStatus } from '../src/jobs/enums/job-status.enum';
import { UrlCheckStatus } from '../src/jobs/enums/url-check-status.enum';
import type { HttpCheckResult } from '../src/jobs/http/http-check-result.interface';
import { HttpClientService } from '../src/jobs/http/http-client.service';
import type { JobDetails } from '../src/jobs/interfaces/job-details.interface';
import type { JobSummary } from '../src/jobs/interfaces/job-summary.interface';
import { JobsRepository } from '../src/jobs/repositories/jobs.repository';

type CheckFunction = (url: string) => Promise<HttpCheckResult>;

interface CreateJobResponseBody {
  jobId: string;
}

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly settled: boolean;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

interface ValidationCase {
  name: string;
  payload: object;
  expectedMessage: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UNKNOWN_JOB_ID = '00000000-0000-4000-8000-000000000000';

const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
  JobStatus.FAILED,
]);

const TERMINAL_ITEM_STATUSES = new Set<UrlCheckStatus>([
  UrlCheckStatus.SUCCESS,
  UrlCheckStatus.ERROR,
  UrlCheckStatus.CANCELLED,
]);

const E2E_JOBS_CONFIG: JobsConfig = {
  headRequestTimeoutMs: 1_000,
  maxConcurrency: 5,
  artificialDelay: {
    minMs: 0,
    maxMs: 0,
  },
};

function createDeferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,

    get settled(): boolean {
      return settled;
    },

    resolve(value: T | PromiseLike<T>): void {
      if (settled) {
        return;
      }

      settled = true;
      resolvePromise(value);
    },

    reject(reason?: unknown): void {
      if (settled) {
        return;
      }

      settled = true;
      rejectPromise(reason);
    },
  };
}

function expectParseableTimestamp(value: string | null): void {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('string');
  expect(Number.isNaN(Date.parse(value ?? ''))).toBe(false);
}

function isTerminalJob(job: JobDetails): boolean {
  return (
    TERMINAL_JOB_STATUSES.has(job.status) &&
    job.finishedAt !== null &&
    job.items.every((item) => TERMINAL_ITEM_STATUSES.has(item.status))
  );
}

describe('Jobs API (e2e)', () => {
  let app: INestApplication<Server>;
  let testingModule: TestingModule;
  let checkMock: Mock<CheckFunction>;

  const deferredCleanups: Array<() => void> = [];

  function trackDeferred(
    fallbackResult: HttpCheckResult,
  ): Deferred<HttpCheckResult> {
    const deferred = createDeferred<HttpCheckResult>();

    deferredCleanups.push(() => {
      if (!deferred.settled) {
        deferred.resolve(fallbackResult);
      }
    });

    return deferred;
  }

  async function getJobDetails(jobId: string): Promise<JobDetails> {
    const response = await request(app.getHttpServer())
      .get(`/api/jobs/${jobId}`)
      .expect(200);

    return response.body as JobDetails;
  }

  async function waitForJobDetails(
    jobId: string,
    predicate: (job: JobDetails) => boolean,
  ): Promise<JobDetails> {
    const maximumAttempts = 100;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const job = await getJobDetails(jobId);

      if (predicate(job)) {
        return job;
      }
    }

    throw new Error(
      `Job ${jobId} did not reach the expected state after ${maximumAttempts} HTTP requests`,
    );
  }

  async function waitForBackgroundJobsToSettle(): Promise<void> {
    const repository = app.get(JobsRepository);
    const maximumAttempts = 100;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const jobs = repository.findAll();

      const allJobsSettled = jobs.every(
        (job) =>
          TERMINAL_JOB_STATUSES.has(job.status) &&
          job.finishedAt !== null &&
          job.items.every((item) => TERMINAL_ITEM_STATUSES.has(item.status)),
      );

      if (allJobsSettled) {
        return;
      }

      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  }

  beforeEach(async () => {
    deferredCleanups.length = 0;

    checkMock = vi
      .fn<CheckFunction>()
      .mockResolvedValue({ httpStatus: 200, errorMessage: null });

    testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpClientService)
      .useValue({
        check: checkMock,
      })
      .overrideProvider(jobsConfig.KEY)
      .useValue(E2E_JOBS_CONFIG)
      .compile();

    app = testingModule.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    for (const cleanup of deferredCleanups) {
      cleanup();
    }

    await waitForBackgroundJobsToSettle();
    await app.close();
  });

  it('creates a job and exposes it through list and details endpoints', async () => {
    const urls = ['https://first.example.com', 'https://second.example.com'];

    const activeChecks: Array<Deferred<HttpCheckResult>> = [];

    checkMock.mockImplementation(() => {
      const deferred = trackDeferred({
        httpStatus: 200,
        errorMessage: null,
      });

      activeChecks.push(deferred);

      return deferred.promise;
    });

    const createResponse = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls })
      .expect(201);

    const createBody = createResponse.body as CreateJobResponseBody;

    expect(createBody.jobId).toEqual(expect.any(String));
    expect(createBody.jobId).toMatch(UUID_PATTERN);

    const listResponse = await request(app.getHttpServer())
      .get('/api/jobs')
      .expect(200);

    const summaries = listResponse.body as JobSummary[];
    const summary = summaries.find((job) => job.id === createBody.jobId);

    expect(summary).toBeDefined();

    if (!summary) {
      throw new Error(`Expected job ${createBody.jobId} in the jobs list`);
    }

    expectParseableTimestamp(summary.createdAt);
    expect([JobStatus.PENDING, JobStatus.IN_PROGRESS]).toContain(
      summary.status,
    );
    expect(summary.statistics.total).toBe(urls.length);
    expect(summary.statistics.pending + summary.statistics.inProgress).toBe(
      urls.length,
    );
    expect(summary.statistics.success).toBe(0);
    expect(summary.statistics.error).toBe(0);
    expect(summary.statistics.cancelled).toBe(0);
    expect(summary.statistics.processed).toBe(0);

    const details = await getJobDetails(createBody.jobId);

    expect(details.id).toBe(createBody.jobId);
    expect(details.createdAt).toBe(summary.createdAt);
    expect(details.status).toBe(summary.status);
    expect(details.statistics).toEqual(summary.statistics);
    expect(details.failureMessage).toBeNull();
    expect(details.items).toHaveLength(urls.length);
    expect(details.items.map((item) => item.url)).toEqual(urls);

    expect(new Set(details.items.map((item) => item.id)).size).toBe(
      urls.length,
    );

    details.items.forEach((item) => {
      expect(item.id).toMatch(UUID_PATTERN);
      expect([UrlCheckStatus.PENDING, UrlCheckStatus.IN_PROGRESS]).toContain(
        item.status,
      );
      expect(item.httpStatus).toBeNull();
      expect(item.errorMessage).toBeNull();
      expect(item.finishedAt).toBeNull();
      expect(item.durationMs).toBeNull();

      if (item.status === UrlCheckStatus.PENDING) {
        expect(item.startedAt).toBeNull();
      } else {
        expectParseableTimestamp(item.startedAt);
      }
    });

    activeChecks.forEach((deferred) => {
      deferred.resolve({
        httpStatus: 200,
        errorMessage: null,
      });
    });

    await waitForJobDetails(createBody.jobId, isTerminalJob);
  });

  it('completes a job with successful and failed URL checks', async () => {
    const successUrl = 'https://success.example.com';
    const errorUrl = 'https://error.example.com';

    checkMock.mockImplementation((url) => {
      if (url === successUrl) {
        return Promise.resolve({
          httpStatus: 204,
          errorMessage: null,
        });
      }

      if (url === errorUrl) {
        return Promise.resolve({
          httpStatus: null,
          errorMessage: 'HTTP request failed',
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const createResponse = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({
        urls: [successUrl, errorUrl],
      })
      .expect(201);

    const { jobId } = createResponse.body as CreateJobResponseBody;

    const details = await waitForJobDetails(
      jobId,
      (job) => job.status === JobStatus.COMPLETED,
    );

    expect(details.status).toBe(JobStatus.COMPLETED);
    expect(details.status).not.toBe(JobStatus.FAILED);
    expect(details.failureMessage).toBeNull();

    expectParseableTimestamp(details.createdAt);
    expectParseableTimestamp(details.startedAt);
    expectParseableTimestamp(details.finishedAt);

    const successItem = details.items.find((item) => item.url === successUrl);
    const errorItem = details.items.find((item) => item.url === errorUrl);

    expect(successItem).toBeDefined();
    expect(errorItem).toBeDefined();

    if (!successItem || !errorItem) {
      throw new Error('Expected both URL check items in job details');
    }

    expect(successItem.status).toBe(UrlCheckStatus.SUCCESS);
    expect(successItem.httpStatus).toBe(204);
    expect(successItem.errorMessage).toBeNull();
    expectParseableTimestamp(successItem.startedAt);
    expectParseableTimestamp(successItem.finishedAt);
    expect(successItem.durationMs).not.toBeNull();
    expect(successItem.durationMs ?? -1).toBeGreaterThanOrEqual(0);

    expect(errorItem.status).toBe(UrlCheckStatus.ERROR);
    expect(errorItem.httpStatus).toBeNull();
    expect(errorItem.errorMessage).toBe('HTTP request failed');
    expectParseableTimestamp(errorItem.startedAt);
    expectParseableTimestamp(errorItem.finishedAt);
    expect(errorItem.durationMs).not.toBeNull();
    expect(errorItem.durationMs ?? -1).toBeGreaterThanOrEqual(0);

    expect(details.statistics).toEqual({
      total: 2,
      pending: 0,
      inProgress: 0,
      success: 1,
      error: 1,
      cancelled: 0,
      processed: 2,
    });

    const listResponse = await request(app.getHttpServer())
      .get('/api/jobs')
      .expect(200);

    const summaries = listResponse.body as JobSummary[];
    const summary = summaries.find((job) => job.id === jobId);

    expect(summary).toBeDefined();

    if (!summary) {
      throw new Error(`Expected completed job ${jobId} in the jobs list`);
    }

    expect(summary.status).toBe(JobStatus.COMPLETED);
    expect(summary.status).not.toBe(JobStatus.FAILED);
    expect(summary.createdAt).toBe(details.createdAt);
    expect(summary.statistics).toEqual(details.statistics);
  });

  it('cancels pending items and finalizes already started checks without completing the job', async () => {
    const urls = Array.from(
      { length: E2E_JOBS_CONFIG.maxConcurrency + 2 },
      (_, index) => `https://cancel-${index + 1}.example.com`,
    );

    const allActiveChecksStarted = createDeferred<void>();
    const activeChecks: Array<Deferred<HttpCheckResult>> = [];

    checkMock.mockImplementation(() => {
      const deferred = trackDeferred({
        httpStatus: 200,
        errorMessage: null,
      });

      activeChecks.push(deferred);

      if (activeChecks.length === E2E_JOBS_CONFIG.maxConcurrency) {
        allActiveChecksStarted.resolve(undefined);
      }

      return deferred.promise;
    });

    const createResponse = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls })
      .expect(201);

    const { jobId } = createResponse.body as CreateJobResponseBody;

    await allActiveChecksStarted.promise;

    expect(checkMock).toHaveBeenCalledTimes(E2E_JOBS_CONFIG.maxConcurrency);

    const beforeCancellation = await getJobDetails(jobId);

    expect(beforeCancellation.status).toBe(JobStatus.IN_PROGRESS);
    expect(
      beforeCancellation.items.filter(
        (item) => item.status === UrlCheckStatus.IN_PROGRESS,
      ),
    ).toHaveLength(E2E_JOBS_CONFIG.maxConcurrency);
    expect(
      beforeCancellation.items.filter(
        (item) => item.status === UrlCheckStatus.PENDING,
      ),
    ).toHaveLength(2);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/jobs/${jobId}`)
      .expect(204);

    expect(deleteResponse.text).toBe('');

    const immediatelyCancelled = await getJobDetails(jobId);

    expect(immediatelyCancelled.status).toBe(JobStatus.CANCELLED);
    expect(immediatelyCancelled.status).not.toBe(JobStatus.COMPLETED);
    expect(immediatelyCancelled.finishedAt).toBeNull();
    expect(immediatelyCancelled.failureMessage).toBeNull();

    expect(
      immediatelyCancelled.items.filter(
        (item) => item.status === UrlCheckStatus.IN_PROGRESS,
      ),
    ).toHaveLength(E2E_JOBS_CONFIG.maxConcurrency);

    const immediatelyCancelledItems = immediatelyCancelled.items.filter(
      (item) => item.status === UrlCheckStatus.CANCELLED,
    );

    expect(immediatelyCancelledItems).toHaveLength(2);

    immediatelyCancelledItems.forEach((item) => {
      expect(item.startedAt).toBeNull();
      expectParseableTimestamp(item.finishedAt);
      expect(item.durationMs).toBe(0);
      expect(item.httpStatus).toBeNull();
      expect(item.errorMessage).toBeNull();
    });

    expect(checkMock).toHaveBeenCalledTimes(E2E_JOBS_CONFIG.maxConcurrency);

    activeChecks.forEach((deferred) => {
      deferred.resolve({
        httpStatus: 200,
        errorMessage: null,
      });
    });

    const finalizedCancellation = await waitForJobDetails(
      jobId,
      (job) =>
        job.status === JobStatus.CANCELLED &&
        job.finishedAt !== null &&
        job.items.every((item) => TERMINAL_ITEM_STATUSES.has(item.status)),
    );

    expect(finalizedCancellation.status).toBe(JobStatus.CANCELLED);
    expect(finalizedCancellation.status).not.toBe(JobStatus.COMPLETED);
    expectParseableTimestamp(finalizedCancellation.startedAt);
    expectParseableTimestamp(finalizedCancellation.finishedAt);

    expect(
      finalizedCancellation.items.filter(
        (item) => item.status === UrlCheckStatus.SUCCESS,
      ),
    ).toHaveLength(E2E_JOBS_CONFIG.maxConcurrency);

    expect(
      finalizedCancellation.items.filter(
        (item) => item.status === UrlCheckStatus.CANCELLED,
      ),
    ).toHaveLength(2);

    expect(finalizedCancellation.statistics).toEqual({
      total: urls.length,
      pending: 0,
      inProgress: 0,
      success: E2E_JOBS_CONFIG.maxConcurrency,
      error: 0,
      cancelled: 2,
      processed: urls.length,
    });

    expect(checkMock).toHaveBeenCalledTimes(E2E_JOBS_CONFIG.maxConcurrency);

    const repeatedGet = await getJobDetails(jobId);

    expect(repeatedGet.status).toBe(JobStatus.CANCELLED);
    expect(repeatedGet.status).not.toBe(JobStatus.COMPLETED);
    expect(repeatedGet.startedAt).toBe(finalizedCancellation.startedAt);
    expect(repeatedGet.finishedAt).toBe(finalizedCancellation.finishedAt);
    expect(repeatedGet.statistics).toEqual(finalizedCancellation.statistics);
    expect(repeatedGet.items).toEqual(finalizedCancellation.items);

    expect(checkMock).toHaveBeenCalledTimes(E2E_JOBS_CONFIG.maxConcurrency);
  });

  describe('Jobs API validation (e2e)', () => {
    it('rejects invalid job payloads', async () => {
      const validationCases: ValidationCase[] = [
        {
          name: 'missing urls',
          payload: {},
          expectedMessage: 'urls is required',
        },
        {
          name: 'urls is not an array',
          payload: {
            urls: 'https://example.com',
          },
          expectedMessage: 'urls must be an array',
        },
        {
          name: 'urls is an empty array',
          payload: {
            urls: [],
          },
          expectedMessage: 'urls must contain at least one URL',
        },
        {
          name: 'an array element is not a string',
          payload: {
            urls: [123],
          },
          expectedMessage: 'each value in urls must be a string',
        },
        {
          name: 'a URL has no explicit HTTP or HTTPS protocol',
          payload: {
            urls: ['example.com'],
          },
          expectedMessage:
            'each value in urls must be a valid HTTP or HTTPS URL with an explicit protocol',
        },
        {
          name: 'urls exceeds the maximum size',
          payload: {
            urls: Array.from(
              { length: 101 },
              (_, index) => `https://validation-${index + 1}.example.com`,
            ),
          },
          expectedMessage: 'urls must contain no more than 100 URLs',
        },
      ];

      for (const validationCase of validationCases) {
        const response = await request(app.getHttpServer())
          .post('/api/jobs')
          .send(validationCase.payload)
          .expect(400);

        const errorBody = response.body as ErrorResponseBody;

        expect(
          errorBody,
          `Unexpected error response for case: ${validationCase.name}`,
        ).toMatchObject({
          statusCode: 400,
          error: 'Bad Request',
        });

        expect(
          Array.isArray(errorBody.message),
          `Expected validation messages array for case: ${validationCase.name}`,
        ).toBe(true);

        expect(
          errorBody.message,
          `Missing validation message for case: ${validationCase.name}`,
        ).toContain(validationCase.expectedMessage);
      }

      expect(checkMock).not.toHaveBeenCalled();

      const listResponse = await request(app.getHttpServer())
        .get('/api/jobs')
        .expect(200);

      expect(listResponse.body).toEqual([]);
    });
  });

  describe('Jobs API errors (e2e)', () => {
    it('returns 404 when job details are requested for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/jobs/${UNKNOWN_JOB_ID}`)
        .expect(404);

      expect(response.body as ErrorResponseBody).toEqual({
        statusCode: 404,
        message: `Job with id ${UNKNOWN_JOB_ID} was not found`,
        error: 'Not Found',
      });

      expect(checkMock).not.toHaveBeenCalled();

      const listResponse = await request(app.getHttpServer())
        .get('/api/jobs')
        .expect(200);

      expect(listResponse.body).toEqual([]);
    });

    it('returns 404 when cancellation is requested for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/jobs/${UNKNOWN_JOB_ID}`)
        .expect(404);

      expect(response.body as ErrorResponseBody).toEqual({
        statusCode: 404,
        message: `Job with id ${UNKNOWN_JOB_ID} was not found`,
        error: 'Not Found',
      });

      expect(checkMock).not.toHaveBeenCalled();

      const listResponse = await request(app.getHttpServer())
        .get('/api/jobs')
        .expect(200);

      expect(listResponse.body).toEqual([]);
    });
  });
});
