export interface EnvironmentVariables {
  PORT: number;
  FRONTEND_ORIGIN: string;
  HEAD_REQUEST_TIMEOUT_MS: number;
  MAX_CONCURRENCY: number;
  MAX_GLOBAL_HEAD_CONCURRENCY: number;
  MAX_COMPLETED_JOBS_HISTORY: number;
  ARTIFICIAL_DELAY_MIN_MS: number;
  ARTIFICIAL_DELAY_MAX_MS: number;
  MAX_ACTIVE_JOBS: number;
  CREATE_JOB_RATE_LIMIT: number;
  CREATE_JOB_RATE_WINDOW_MS: number;
}

export interface AppConfig {
  port: number;
  frontendOrigin: string;
}

export interface JobsConfig {
  headRequestTimeoutMs: number;
  maxConcurrency: number;
  maxGlobalHeadConcurrency: number;
  maxActiveJobs: number;
  maxCompletedJobsHistory: number;
  creationRateLimit: {
    maxJobs: number;
    windowMs: number;
  };
  artificialDelay: {
    minMs: number;
    maxMs: number;
  };
}
