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
      type: 'success',
      httpStatus: 200,
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

  it('returns a final 3xx response as an HTTP error', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
      }),
    );

    const result = await service.check('https://example.com/redirect');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 302,
      errorMessage: 'HTTP request ended with redirect status 302',
    });
  });

  it('returns 404 as an HTTP error with the response status', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 404,
      }),
    );

    const result = await service.check('https://example.com/missing');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 404,
      errorMessage: 'HTTP request returned status 404',
    });
  });

  it('returns 500 as an HTTP error with the response status', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 500,
      }),
    );

    const result = await service.check('https://example.com/error');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 500,
      errorMessage: 'HTTP request returned status 500',
    });
  });

  it('normalizes a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await service.check('https://unavailable.example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'HTTP request failed',
    });
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
      type: 'transport_error',
      errorMessage: `Request timed out after 1234 ms`,
    });
  });

  it('normalizes an aborted request', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('This operation was aborted', 'AbortError'),
    );

    const result = await service.check('https://aborted.example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'Request was aborted',
    });
  });

  it('normalizes an unknown rejected value', async () => {
    fetchMock.mockRejectedValue('unexpected failure');

    const result = await service.check('https://example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'HTTP request failed',
    });
  });
});
