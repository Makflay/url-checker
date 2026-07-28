import {
  DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
  DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
  DEFAULT_FRONTEND_ORIGIN,
  DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_PORT,
  MAX_CONCURRENCY_LIMIT,
  MAX_PORT,
  MIN_PORT,
} from './environment.constants';
import type { EnvironmentVariables } from './environment.types';

function parseInteger(
  value: unknown,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum?: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Configuration error: ${name} must be an integer`);
  }

  if (
    typeof value === 'string' &&
    (value.length === 0 || value.trim() !== value)
  ) {
    throw new Error(`Configuration error: ${name} must be an integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new Error(`Configuration error: ${name} must be an integer`);
  }

  if (parsedValue < minimum) {
    throw new Error(`Configuration error: ${name} must be at least ${minimum}`);
  }

  if (maximum !== undefined && parsedValue > maximum) {
    throw new Error(`Configuration error: ${name} must not exceed ${maximum}`);
  }

  return parsedValue;
}

function parseOrigin(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_FRONTEND_ORIGIN;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      'Configuration error: FRONTEND_ORIGIN must be a valid HTTP/HTTPS origin',
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'Configuration error: FRONTEND_ORIGIN must be a valid HTTP/HTTPS origin',
    );
  }

  const isHttpProtocol = url.protocol === 'http:' || url.protocol === 'https:';

  const isOriginOnly =
    value === url.origin &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';

  if (!isHttpProtocol || !isOriginOnly) {
    throw new Error(
      'Configuration error: FRONTEND_ORIGIN must be a valid HTTP/HTTPS origin',
    );
  }

  return value;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): EnvironmentVariables {
  const validatedEnvironment: EnvironmentVariables = {
    PORT: parseInteger(
      environment.PORT,
      'PORT',
      DEFAULT_PORT,
      MIN_PORT,
      MAX_PORT,
    ),
    FRONTEND_ORIGIN: parseOrigin(environment.FRONTEND_ORIGIN),
    HEAD_REQUEST_TIMEOUT_MS: parseInteger(
      environment.HEAD_REQUEST_TIMEOUT_MS,
      'HEAD_REQUEST_TIMEOUT_MS',
      DEFAULT_HEAD_REQUEST_TIMEOUT_MS,
      1,
    ),
    MAX_CONCURRENCY: parseInteger(
      environment.MAX_CONCURRENCY,
      'MAX_CONCURRENCY',
      DEFAULT_MAX_CONCURRENCY,
      1,
      MAX_CONCURRENCY_LIMIT,
    ),
    ARTIFICIAL_DELAY_MIN_MS: parseInteger(
      environment.ARTIFICIAL_DELAY_MIN_MS,
      'ARTIFICIAL_DELAY_MIN_MS',
      DEFAULT_ARTIFICIAL_DELAY_MIN_MS,
      0,
    ),
    ARTIFICIAL_DELAY_MAX_MS: parseInteger(
      environment.ARTIFICIAL_DELAY_MAX_MS,
      'ARTIFICIAL_DELAY_MAX_MS',
      DEFAULT_ARTIFICIAL_DELAY_MAX_MS,
      0,
    ),
  };

  if (
    validatedEnvironment.ARTIFICIAL_DELAY_MIN_MS >
    validatedEnvironment.ARTIFICIAL_DELAY_MAX_MS
  ) {
    throw new Error(
      'Configuration error: ARTIFICIAL_DELAY_MIN_MS must not exceed ARTIFICIAL_DELAY_MAX_MS',
    );
  }

  return validatedEnvironment;
}
