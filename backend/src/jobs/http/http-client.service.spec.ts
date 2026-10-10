import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobsConfig } from '../../config';
import { HttpClientService } from './http-client.service';
import { OutboundUrlValidationError } from './outbound-url-validation';
import {
  performSecureHeadRequest,
  SecureHttpTransportError,
} from './secure-http-transport';

vi.mock('./secure-http-transport', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./secure-http-transport')>();

  return {
    ...original,
    performSecureHeadRequest: vi.fn(),
  };
});

const testConfig: JobsConfig = {
  headRequestTimeoutMs: 1234,
  maxConcurrency: 2,
  maxActiveJobs: 4,
  creationRateLimit: {
    maxJobs: 10,
    windowMs: 60_000,
  },
  artificialDelay: {
    minMs: 0,
    maxMs: 0,
  },
};

describe('HttpClientService', () => {
  let service: HttpClientService;

  const performSecureHeadRequestMock = vi.mocked(performSecureHeadRequest);

  beforeEach(() => {
    vi.clearAllMocks();

    service = new HttpClientService(testConfig);
  });

  it('returns the HTTP status for a successful response', async () => {
    performSecureHeadRequestMock.mockResolvedValue({
      statusCode: 200,
    });

    const result = await service.check('https://example.com');

    expect(result).toEqual({
      type: 'success',
      httpStatus: 200,
    });

    expect(performSecureHeadRequestMock).toHaveBeenCalledTimes(1);
    expect(performSecureHeadRequestMock).toHaveBeenCalledWith(
      'https://example.com',
      1234,
    );
  });

  it('returns a final 3xx response as an HTTP error', async () => {
    performSecureHeadRequestMock.mockResolvedValue({
      statusCode: 302,
    });

    const result = await service.check('https://example.com/redirect');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 302,
      errorMessage: 'HTTP request ended with redirect status 302',
    });
  });

  it('preserves a controlled redirect error message', async () => {
    performSecureHeadRequestMock.mockResolvedValue({
      statusCode: 302,
      errorMessage: 'HTTP redirect cycle was detected',
    });

    const result = await service.check('https://example.com/redirect');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 302,
      errorMessage: 'HTTP redirect cycle was detected',
    });
  });

  it('returns 404 as an HTTP error with the response status', async () => {
    performSecureHeadRequestMock.mockResolvedValue({
      statusCode: 404,
    });

    const result = await service.check('https://example.com/missing');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 404,
      errorMessage: 'HTTP request returned status 404',
    });
  });

  it('returns 500 as an HTTP error with the response status', async () => {
    performSecureHeadRequestMock.mockResolvedValue({
      statusCode: 500,
    });

    const result = await service.check('https://example.com/error');

    expect(result).toEqual({
      type: 'http_error',
      httpStatus: 500,
      errorMessage: 'HTTP request returned status 500',
    });
  });

  it('returns a safe URL validation error', async () => {
    performSecureHeadRequestMock.mockRejectedValue(
      new OutboundUrlValidationError('URL resolves to a non-public IP address'),
    );

    const result = await service.check('http://127.0.0.1');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'URL resolves to a non-public IP address',
    });
  });

  it('returns a safe secure transport error', async () => {
    performSecureHeadRequestMock.mockRejectedValue(
      new SecureHttpTransportError(
        'HTTP connection used an unvalidated address',
      ),
    );

    const result = await service.check('https://example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'HTTP connection used an unvalidated address',
    });
  });

  it('normalizes a network error', async () => {
    performSecureHeadRequestMock.mockRejectedValue(
      new TypeError('socket failed for a remote address'),
    );

    const result = await service.check('https://unavailable.example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'HTTP request failed',
    });
  });

  it('normalizes a timeout error', async () => {
    performSecureHeadRequestMock.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    const result = await service.check('https://slow.example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'Request timed out after 1234 ms',
    });
  });

  it('normalizes an aborted request', async () => {
    performSecureHeadRequestMock.mockRejectedValue(
      new DOMException('This operation was aborted', 'AbortError'),
    );

    const result = await service.check('https://aborted.example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'Request was aborted',
    });
  });

  it('normalizes an unknown rejected value', async () => {
    performSecureHeadRequestMock.mockRejectedValue('unexpected failure');

    const result = await service.check('https://example.com');

    expect(result).toEqual({
      type: 'transport_error',
      errorMessage: 'HTTP request failed',
    });
  });
});
