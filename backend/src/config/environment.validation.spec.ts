import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
  DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
  DEFAULT_CREATE_JOB_RATE_LIMIT,
  DEFAULT_CREATE_JOB_RATE_WINDOW_MS,
  DEFAULT_MAX_ACTIVE_JOBS,
  DEFAULT_MAX_CONCURRENCY,
} from './environment.constants';
import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('uses the required jobs defaults', () => {
    const environment = validateEnvironment({});

    expect(environment.MAX_CONCURRENCY).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(environment.ARTIFICIAL_DELAY_MIN_MS).toBe(
      DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
    );
    expect(environment.ARTIFICIAL_DELAY_MAX_MS).toBe(
      DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
    );
    expect(environment.MAX_ACTIVE_JOBS).toBe(DEFAULT_MAX_ACTIVE_JOBS);
    expect(environment.CREATE_JOB_RATE_LIMIT).toBe(
      DEFAULT_CREATE_JOB_RATE_LIMIT,
    );
    expect(environment.CREATE_JOB_RATE_WINDOW_MS).toBe(
      DEFAULT_CREATE_JOB_RATE_WINDOW_MS,
    );
  });

  it.each(['1', '5'])('accepts MAX_CONCURRENCY=%s', (maxConcurrency) => {
    const environment = validateEnvironment({
      MAX_CONCURRENCY: maxConcurrency,
    });

    expect(environment.MAX_CONCURRENCY).toBe(Number(maxConcurrency));
  });

  it.each(['0', '6', '100'])('rejects MAX_CONCURRENCY=%s', (maxConcurrency) => {
    expect(() =>
      validateEnvironment({
        MAX_CONCURRENCY: maxConcurrency,
      }),
    ).toThrow();
  });

  it.each(['1', '4', '100'])('accepts MAX_ACTIVE_JOBS=%s', (maxActiveJobs) => {
    const environment = validateEnvironment({
      MAX_ACTIVE_JOBS: maxActiveJobs,
    });

    expect(environment.MAX_ACTIVE_JOBS).toBe(Number(maxActiveJobs));
  });

  it.each(['0', '-1', '101'])('rejects MAX_ACTIVE_JOBS=%s', (maxActiveJobs) => {
    expect(() =>
      validateEnvironment({
        MAX_ACTIVE_JOBS: maxActiveJobs,
      }),
    ).toThrow();
  });

  it.each(['1', '10', '1000'])(
    'accepts CREATE_JOB_RATE_LIMIT=%s',
    (rateLimit) => {
      const environment = validateEnvironment({
        CREATE_JOB_RATE_LIMIT: rateLimit,
      });

      expect(environment.CREATE_JOB_RATE_LIMIT).toBe(Number(rateLimit));
    },
  );

  it.each(['0', '-1', '1001'])(
    'rejects CREATE_JOB_RATE_LIMIT=%s',
    (rateLimit) => {
      expect(() =>
        validateEnvironment({
          CREATE_JOB_RATE_LIMIT: rateLimit,
        }),
      ).toThrow();
    },
  );

  it.each(['1000', '60000', '3600000'])(
    'accepts CREATE_JOB_RATE_WINDOW_MS=%s',
    (windowMs) => {
      const environment = validateEnvironment({
        CREATE_JOB_RATE_WINDOW_MS: windowMs,
      });

      expect(environment.CREATE_JOB_RATE_WINDOW_MS).toBe(Number(windowMs));
    },
  );

  it.each(['0', '999', '3600001'])(
    'rejects CREATE_JOB_RATE_WINDOW_MS=%s',
    (windowMs) => {
      expect(() =>
        validateEnvironment({
          CREATE_JOB_RATE_WINDOW_MS: windowMs,
        }),
      ).toThrow();
    },
  );

  it.each([
    {
      name: 'fractional active jobs',
      variable: 'MAX_ACTIVE_JOBS',
      value: '1.5',
    },
    {
      name: 'fractional rate limit',
      variable: 'CREATE_JOB_RATE_LIMIT',
      value: '10.5',
    },
    {
      name: 'fractional rate window',
      variable: 'CREATE_JOB_RATE_WINDOW_MS',
      value: '60000.5',
    },
  ])('rejects $name', ({ variable, value }) => {
    expect(() =>
      validateEnvironment({
        [variable]: value,
      }),
    ).toThrow();
  });

  it.each([
    {
      minMs: '0',
      maxMs: '0',
    },
    {
      minMs: '0',
      maxMs: '10000',
    },
    {
      minMs: '10000',
      maxMs: '10000',
    },
  ])(
    'accepts artificial delay from $minMs to $maxMs ms',
    ({ minMs, maxMs }) => {
      const environment = validateEnvironment({
        ARTIFICIAL_DELAY_MIN_MS: minMs,
        ARTIFICIAL_DELAY_MAX_MS: maxMs,
      });

      expect(environment.ARTIFICIAL_DELAY_MIN_MS).toBe(Number(minMs));
      expect(environment.ARTIFICIAL_DELAY_MAX_MS).toBe(Number(maxMs));
    },
  );

  it.each([
    {
      name: 'negative minimum',
      minMs: '-1',
      maxMs: '10000',
    },
    {
      name: 'minimum above 10000',
      minMs: '10001',
      maxMs: '10001',
    },
    {
      name: 'negative maximum',
      minMs: '0',
      maxMs: '-1',
    },
    {
      name: 'maximum above 10000',
      minMs: '0',
      maxMs: '10001',
    },
    {
      name: 'minimum greater than maximum',
      minMs: '5001',
      maxMs: '5000',
    },
  ])('rejects an invalid artificial delay: $name', ({ minMs, maxMs }) => {
    expect(() =>
      validateEnvironment({
        ARTIFICIAL_DELAY_MIN_MS: minMs,
        ARTIFICIAL_DELAY_MAX_MS: maxMs,
      }),
    ).toThrow();
  });
});
