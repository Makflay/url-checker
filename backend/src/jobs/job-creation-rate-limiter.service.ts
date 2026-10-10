import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { jobsConfig } from '../config';
import type { JobsConfig } from '../config';

const RATE_LIMIT_MESSAGE = 'Too many jobs were created. Try again later.';

export class JobCreationRateLimitException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super(RATE_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class JobCreationRateLimiter {
  private readonly acceptedCreationTimestamps: number[] = [];

  constructor(
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
  ) {}

  assertCreationAllowed(nowMs: number): void {
    this.removeExpiredTimestamps(nowMs);

    const { maxJobs, windowMs } = this.config.creationRateLimit;

    if (this.acceptedCreationTimestamps.length < maxJobs) {
      return;
    }

    const oldestTimestamp = this.acceptedCreationTimestamps[0];

    if (oldestTimestamp === undefined) {
      return;
    }

    const retryAfterMs = Math.max(1, oldestTimestamp + windowMs - nowMs);

    throw new JobCreationRateLimitException(
      Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    );
  }

  recordAcceptedCreation(nowMs: number): void {
    this.removeExpiredTimestamps(nowMs);
    this.acceptedCreationTimestamps.push(nowMs);
  }

  private removeExpiredTimestamps(nowMs: number): void {
    const windowStartMs = nowMs - this.config.creationRateLimit.windowMs;

    while (
      this.acceptedCreationTimestamps[0] !== undefined &&
      this.acceptedCreationTimestamps[0] <= windowStartMs
    ) {
      this.acceptedCreationTimestamps.shift();
    }
  }
}
