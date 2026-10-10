import { Injectable, Inject } from '@nestjs/common';

import type { JobsConfig } from '../../config';
import type { HttpCheckResult } from './http-check-result.interface';

import { jobsConfig } from '../../config';
import {
  isOutboundSecurityError,
  performSecureHeadRequest,
} from './secure-http-transport';

@Injectable()
export class HttpClientService {
  constructor(
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
  ) {}

  async check(url: string): Promise<HttpCheckResult> {
    try {
      const response = await performSecureHeadRequest(
        url,
        this.config.headRequestTimeoutMs,
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          type: 'success',
          httpStatus: response.statusCode,
        };
      }

      const errorMessage =
        response.errorMessage ??
        (response.statusCode >= 300 && response.statusCode < 400
          ? `HTTP request ended with redirect status ${response.statusCode}`
          : `HTTP request returned status ${response.statusCode}`);

      return {
        type: 'http_error',
        httpStatus: response.statusCode,
        errorMessage,
      };
    } catch (error: unknown) {
      return {
        type: 'transport_error',
        errorMessage: this.getSafeErrorMessage(error),
      };
    }
  }

  private getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        return `Request timed out after ${this.config.headRequestTimeoutMs} ms`;
      }

      if (error.name === 'AbortError') {
        return 'Request was aborted';
      }

      if (isOutboundSecurityError(error)) {
        return error.message;
      }
    }

    return 'HTTP request failed';
  }
}
