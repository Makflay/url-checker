import { Injectable, Inject } from '@nestjs/common';

import { jobsConfig } from '../../config';
import type { JobsConfig } from '../../config';

import type { HttpCheckResult } from './http-check-result.interface';

@Injectable()
export class HttpClientService {
  constructor(
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
  ) {}

  async check(url: string): Promise<HttpCheckResult> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(this.config.headRequestTimeoutMs),
      });

      if (response.ok) {
        return {
          type: 'success',
          httpStatus: response.status,
        };
      }

      const errorMessage =
        response.status >= 300 && response.status < 400
          ? `HTTP request ended with redirect status ${response.status}`
          : `HTTP request returned status ${response.status}`;

      return {
        type: 'http_error',
        httpStatus: response.status,
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
    }

    return 'HTTP request failed';
  }
}
