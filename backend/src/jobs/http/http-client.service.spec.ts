import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobsConfig } from '../../config';
import { HttpClientService } from './http-client.service';

const testConfig: JobsConfig = {
  headRequestTimeoutMs: 1234,
  maxConcurrency: 2,
  artificialDelay: {
    minMs: 0,
    maxMs: 0,
  },
};

describe('HttpClientService', () => {
  let service: HttpClientService;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    service = new HttpClientService(testConfig);
    fetchMock = vi.fn<typeof fetch>();

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the HTTP status for a successful response', async () => {
    const url = 'https://example.com';

    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
      }),
    );

    const result = await service.check(url);

    expect(result).toEqual({
      httpStatus: 200,
      errorMessage: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall?.[0]).toBe(url);
    expect(fetchCall?.[1]).toMatchObject({
      method: 'HEAD',
      redirect: 'follow',
    });
    expect(fetchCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns 404 as a received HTTP response', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 404,
      }),
    );

    const result = await service.check('https://example.com/missing');

    expect(result).toEqual({
      httpStatus: 404,
      errorMessage: null,
    });
  });

  it('returns 500 as a received HTTP response', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 500,
      }),
    );

    const result = await service.check('https://example.com/error');

    expect(result).toEqual({
      httpStatus: 500,
      errorMessage: null,
    });
  });

  it('normalizes a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await service.check('https://unavailable.example.com');

    expect(result).toEqual({
      httpStatus: null,
      errorMessage: 'HTTP request failed',
    });

    expect(result.errorMessage).not.toContain('fetch failed');
  });

  it('normalizes a timeout error', async () => {
    fetchMock.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    const result = await service.check('https://slow.example.com');

    expect(result).toEqual({
      httpStatus: null,
      errorMessage: `Request timed out after 1234 ms`,
    });
  });

  it('normalizes an aborted request', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('This operation was aborted', 'AbortError'),
    );

    const result = await service.check('https://aborted.example.com');

    expect(result).toEqual({
      httpStatus: null,
      errorMessage: 'Request was aborted',
    });
  });

  it('normalizes an unknown rejected value', async () => {
    fetchMock.mockRejectedValue('unexpected failure');

    const result = await service.check('https://example.com');

    expect(result).toEqual({
      httpStatus: null,
      errorMessage: 'HTTP request failed',
    });
  });
});
