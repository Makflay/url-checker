import { Injectable } from '@nestjs/common';

import { HTTP_REQUEST_TIMEOUT_MS } from '../constants/http.constants';
import type { HttpCheckResult } from './http-check-result.interface';

@Injectable()
export class HttpClientService {
  async check(url: string): Promise<HttpCheckResult> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS),
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
        return `Request timed out after ${HTTP_REQUEST_TIMEOUT_MS} ms`;
      }

      if (error.name === 'AbortError') {
        return 'Request was aborted';
      }
    }

    return 'HTTP request failed';
  }
}
