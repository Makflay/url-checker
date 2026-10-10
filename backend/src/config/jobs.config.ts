import { registerAs } from '@nestjs/config';

import {
  DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
  DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
  DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_CREATE_JOB_RATE_LIMIT,
  DEFAULT_CREATE_JOB_RATE_WINDOW_MS,
  DEFAULT_MAX_ACTIVE_JOBS,
  DEFAULT_MAX_GLOBAL_HEAD_CONCURRENCY,
  DEFAULT_MAX_COMPLETED_JOBS_HISTORY,
} from './environment.constants';
import type { JobsConfig } from './environment.types';

export const jobsConfig = registerAs('jobs', (): JobsConfig => ({
  headRequestTimeoutMs: Number(
    process.env.HEAD_REQUEST_TIMEOUT_MS ?? DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
  ),
  maxConcurrency: Number(
    process.env.MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY,
  ),
  maxGlobalHeadConcurrency: Number(
    process.env.MAX_GLOBAL_HEAD_CONCURRENCY ??
      DEFAULT_MAX_GLOBAL_HEAD_CONCURRENCY,
  ),
  maxActiveJobs: Number(process.env.MAX_ACTIVE_JOBS ?? DEFAULT_MAX_ACTIVE_JOBS),
  maxCompletedJobsHistory: Number(
    process.env.MAX_COMPLETED_JOBS_HISTORY ??
      DEFAULT_MAX_COMPLETED_JOBS_HISTORY,
  ),
  creationRateLimit: {
    maxJobs: Number(
      process.env.CREATE_JOB_RATE_LIMIT ?? DEFAULT_CREATE_JOB_RATE_LIMIT,
    ),
    windowMs: Number(
      process.env.CREATE_JOB_RATE_WINDOW_MS ??
        DEFAULT_CREATE_JOB_RATE_WINDOW_MS,
    ),
  },
  artificialDelay: {
    minMs: Number(
      process.env.ARTIFICIAL_DELAY_MIN_MS ?? DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
    ),
    maxMs: Number(
      process.env.ARTIFICIAL_DELAY_MAX_MS ?? DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
    ),
  },
}));
