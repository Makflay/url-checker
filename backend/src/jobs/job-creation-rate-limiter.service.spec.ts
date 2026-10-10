import { describe, expect, it } from 'vitest';

import type { JobsConfig } from '../config';

import {
  JobCreationRateLimitException,
  JobCreationRateLimiter,
} from './job-creation-rate-limiter.service';

const testConfig: JobsConfig = {
  headRequestTimeoutMs: 1_000,
  maxConcurrency: 5,
  maxActiveJobs: 4,
  creationRateLimit: {
    maxJobs: 3,
    windowMs: 60_000,
  },
  artificialDelay: {
    minMs: 0,
    maxMs: 0,
  },
};

describe('JobCreationRateLimiter', () => {
  it('allows creations below the configured limit', () => {
    const limiter = new JobCreationRateLimiter(testConfig);

    for (let index = 0; index < 3; index += 1) {
      expect(() => limiter.assertCreationAllowed(1_000)).not.toThrow();

      limiter.recordAcceptedCreation(1_000);
    }
  });

  it('rejects another creation inside the sliding window', () => {
    const limiter = new JobCreationRateLimiter(testConfig);

    for (let index = 0; index < 3; index += 1) {
      limiter.assertCreationAllowed(1_000);
      limiter.recordAcceptedCreation(1_000);
    }

    let caughtError: unknown;

    try {
      limiter.assertCreationAllowed(1_001);
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(JobCreationRateLimitException);

    if (!(caughtError instanceof JobCreationRateLimitException)) {
      throw new Error('Expected a rate-limit exception');
    }

    expect(caughtError.getStatus()).toBe(429);
    expect(caughtError.retryAfterSeconds).toBe(60);
  });

  it('allows creation after the oldest timestamp expires', () => {
    const limiter = new JobCreationRateLimiter(testConfig);

    for (let index = 0; index < 3; index += 1) {
      limiter.recordAcceptedCreation(1_000);
    }

    expect(() => limiter.assertCreationAllowed(61_000)).not.toThrow();
  });

  it('does not consume quota when availability is only checked', () => {
    const limiter = new JobCreationRateLimiter(testConfig);

    for (let index = 0; index < 10; index += 1) {
      limiter.assertCreationAllowed(1_000);
    }

    limiter.recordAcceptedCreation(1_000);

    expect(() => limiter.assertCreationAllowed(1_000)).not.toThrow();
  });

  it('returns at least one second in Retry-After', () => {
    const limiter = new JobCreationRateLimiter({
      ...testConfig,
      creationRateLimit: {
        maxJobs: 1,
        windowMs: 60_000,
      },
    });

    limiter.recordAcceptedCreation(1_000);

    expect(() => limiter.assertCreationAllowed(60_999)).toThrow(
      expect.objectContaining({
        retryAfterSeconds: 1,
      }),
    );
  });
});
