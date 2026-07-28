export interface EnvironmentVariables {
  PORT: number;
  FRONTEND_ORIGIN: string;
  HEAD_REQUEST_TIMEOUT_MS: number;
  MAX_CONCURRENCY: number;
  ARTIFICIAL_DELAY_MIN_MS: number;
  ARTIFICIAL_DELAY_MAX_MS: number;
}

export interface AppConfig {
  port: number;
  frontendOrigin: string;
}

export interface JobsConfig {
  headRequestTimeoutMs: number;
  maxConcurrency: number;
  artificialDelay: {
    minMs: number;
    maxMs: number;
  };
}
