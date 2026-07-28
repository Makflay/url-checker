import { registerAs } from '@nestjs/config';

import {
  DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
  DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
  DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
} from './environment.constants';
import type { JobsConfig } from './environment.types';

export const jobsConfig = registerAs('jobs', (): JobsConfig => ({
  headRequestTimeoutMs: Number(
    process.env.HEAD_REQUEST_TIMEOUT_MS ?? DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
  ),
  maxConcurrency: Number(
    process.env.MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY,
  ),
  artificialDelay: {
    minMs: Number(
      process.env.ARTIFICIAL_DELAY_MIN_MS ?? DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
    ),
    maxMs: Number(
      process.env.ARTIFICIAL_DELAY_MAX_MS ?? DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
    ),
  },
}));
