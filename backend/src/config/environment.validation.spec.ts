import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
  DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
  DEFAULT_MAX_CONCURRENCY,
} from './environment.constants';
import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('uses the required concurrency and artificial-delay defaults', () => {
    const environment = validateEnvironment({});

    expect(environment.MAX_CONCURRENCY).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(environment.ARTIFICIAL_DELAY_MIN_MS).toBe(
      DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
    );
    expect(environment.ARTIFICIAL_DELAY_MAX_MS).toBe(
      DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
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
