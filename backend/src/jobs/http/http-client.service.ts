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

      return {
        httpStatus: response.status,
        errorMessage: null,
      };
    } catch (error: unknown) {
      return {
        httpStatus: null,
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
