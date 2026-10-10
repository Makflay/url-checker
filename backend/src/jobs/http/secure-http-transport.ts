import { isIP } from 'node:net';
import type { LookupFunction, Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';

import { buildConnector, Client } from 'undici';

import {
  OutboundUrlValidationError,
  classifyPublicIpAddress,
  validateOutboundTarget,
} from './outbound-url-validation';
import type {
  ValidatedNetworkAddress,
  ValidatedOutboundTarget,
} from './outbound-url-validation';

const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SecureHeadResponse {
  statusCode: number;
  errorMessage?: string;
}

interface HeadResponseBody {
  dump(): Promise<void>;
}

interface HeadDispatcherResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: HeadResponseBody;
}

interface HeadDispatcher {
  request(options: {
    path: string;
    method: 'HEAD';
    signal: AbortSignal;
  }): Promise<HeadDispatcherResponse>;

  destroy(): Promise<void>;
}

export type OutboundTargetValidator = (
  url: string,
) => Promise<ValidatedOutboundTarget>;

export type HeadDispatcherFactory = (
  target: ValidatedOutboundTarget,
  connectTimeoutMs: number,
) => HeadDispatcher;

export interface SecureHttpTransportDependencies {
  validateTarget: OutboundTargetValidator;
  createDispatcher: HeadDispatcherFactory;
}

export class SecureHttpTransportError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'SecureHttpTransportError';
  }
}

type UndiciConnector = ReturnType<typeof buildConnector>;

type RemoteAddressVerifier = (
  socket: Socket | TLSSocket,
  target: ValidatedOutboundTarget,
) => void;

const defaultDependencies: SecureHttpTransportDependencies = {
  validateTarget: validateOutboundTarget,
  createDispatcher: createPinnedDispatcher,
};

function normalizeConnectorHostname(hostname: string): string {
  let normalizedHostname = hostname.trim().toLowerCase();

  if (normalizedHostname.startsWith('[') && normalizedHostname.endsWith(']')) {
    normalizedHostname = normalizedHostname.slice(1, -1);
  }

  if (normalizedHostname.endsWith('.')) {
    normalizedHostname = normalizedHostname.slice(0, -1);
  }

  return normalizedHostname;
}

function createLookupError(message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;

  error.code = 'ENOTFOUND';

  return error;
}

export function createPinnedLookup(
  target: ValidatedOutboundTarget,
): LookupFunction {
  const expectedHostname = normalizeConnectorHostname(target.hostname);

  return (hostname, options, callback): void => {
    const requestedHostname = normalizeConnectorHostname(hostname);

    if (requestedHostname !== expectedHostname) {
      callback(
        createLookupError('Unexpected hostname requested by HTTP transport'),
        '',
        0,
      );

      return;
    }

    const requestedFamily =
      options.family === 4 || options.family === 6 ? options.family : 0;

    const matchingAddresses =
      requestedFamily === 0
        ? target.addresses
        : target.addresses.filter(
            (address) => address.family === requestedFamily,
          );

    if (matchingAddresses.length === 0) {
      callback(
        createLookupError('No validated address matches the requested family'),
        '',
        0,
      );

      return;
    }

    if (options.all) {
      callback(
        null,
        matchingAddresses.map((address) => ({
          address: address.address,
          family: address.family,
        })),
      );

      return;
    }

    const selectedAddress = matchingAddresses[0];

    if (selectedAddress === undefined) {
      callback(createLookupError('No validated address is available'), '', 0);

      return;
    }

    callback(null, selectedAddress.address, selectedAddress.family);
  };
}

function createAddressKey(address: ValidatedNetworkAddress): string {
  return `${address.family}:${address.address}`;
}

function assertAllowedRemoteAddress(
  socket: Socket | TLSSocket,
  target: ValidatedOutboundTarget,
): void {
  const remoteAddress = socket.remoteAddress;

  if (remoteAddress === undefined) {
    throw new SecureHttpTransportError(
      'HTTP connection address could not be verified',
    );
  }

  let normalizedRemoteAddress: ValidatedNetworkAddress;

  try {
    normalizedRemoteAddress = classifyPublicIpAddress(remoteAddress);
  } catch {
    throw new SecureHttpTransportError(
      'HTTP connection used a non-public address',
    );
  }

  const allowedAddresses = new Set(target.addresses.map(createAddressKey));

  if (!allowedAddresses.has(createAddressKey(normalizedRemoteAddress))) {
    throw new SecureHttpTransportError(
      'HTTP connection used an unvalidated address',
    );
  }
}

function assertExpectedConnectorTarget(
  options: Parameters<UndiciConnector>[0],
  target: ValidatedOutboundTarget,
): void {
  const connectorHostname = normalizeConnectorHostname(options.hostname);
  const expectedHostname = normalizeConnectorHostname(target.hostname);

  if (connectorHostname !== expectedHostname) {
    throw new SecureHttpTransportError(
      'HTTP transport attempted to connect to an unexpected hostname',
    );
  }

  if (options.protocol !== target.protocol) {
    throw new SecureHttpTransportError(
      'HTTP transport attempted to use an unexpected protocol',
    );
  }

  const connectorPort = Number(options.port);

  if (!Number.isInteger(connectorPort) || connectorPort !== target.port) {
    throw new SecureHttpTransportError(
      'HTTP transport attempted to use an unexpected port',
    );
  }
}

export function createPinnedConnector(
  target: ValidatedOutboundTarget,
  connectTimeoutMs: number,
  connectorBuilder: typeof buildConnector = buildConnector,
  verifyRemoteAddress: RemoteAddressVerifier = assertAllowedRemoteAddress,
): UndiciConnector {
  const baseConnector = connectorBuilder({
    lookup: createPinnedLookup(target),
    timeout: connectTimeoutMs,
    maxCachedSessions: 0,
    autoSelectFamily: target.addresses.length > 1,
    autoSelectFamilyAttemptTimeout: 250,
  });

  const connector: UndiciConnector = (options, callback): void => {
    try {
      assertExpectedConnectorTarget(options, target);
    } catch (error: unknown) {
      callback(
        error instanceof Error
          ? error
          : new SecureHttpTransportError(
              'HTTP connection target verification failed',
            ),
        null,
      );

      return;
    }

    const connectorOptions =
      target.protocol === 'https:' && isIP(target.hostname) === 0
        ? {
            ...options,
            servername: target.hostname,
          }
        : options;

    baseConnector(connectorOptions, (error, socket) => {
      if (error !== null) {
        callback(error, null);

        return;
      }

      try {
        verifyRemoteAddress(socket, target);
        callback(null, socket);
      } catch (verificationError: unknown) {
        socket.destroy();

        callback(
          verificationError instanceof Error
            ? verificationError
            : new SecureHttpTransportError(
                'HTTP connection address verification failed',
              ),
          null,
        );
      }
    });
  };

  return connector;
}

export function createPinnedDispatcher(
  target: ValidatedOutboundTarget,
  connectTimeoutMs: number,
): HeadDispatcher {
  const targetUrl = new URL(target.url);

  const client = new Client(targetUrl.origin, {
    connect: createPinnedConnector(target, connectTimeoutMs),
    pipelining: 1,
    headersTimeout: connectTimeoutMs,
    bodyTimeout: connectTimeoutMs,
  });

  return {
    request(options): Promise<HeadDispatcherResponse> {
      return client.request(options);
    },

    destroy(): Promise<void> {
      return client.destroy();
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('This operation was aborted', 'AbortError');
}

function waitWithSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const handleAbort = (): void => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('This operation was aborted', 'AbortError'),
      );
    };

    signal.addEventListener('abort', handleAbort, {
      once: true,
    });

    operation.then(
      (result) => {
        signal.removeEventListener('abort', handleAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function destroyDispatcherWithinTimeout(
  dispatcher: HeadDispatcher,
  signal: AbortSignal,
): Promise<void> {
  const destruction = dispatcher.destroy();

  /*
   * If the overall timeout expires before destruction settles, cleanup
   * continues in the background. This handler prevents a late unhandled
   * rejection.
   */
  void destruction.catch(() => undefined);

  await waitWithSignal(destruction, signal);
}

function getRemainingTimeoutMs(deadlineMs: number): number {
  const remainingMs = deadlineMs - Date.now();

  if (remainingMs <= 0) {
    throw new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
  }

  return remainingMs;
}

function getRequestPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function getSingleLocation(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const location = headers.location;

  if (location === undefined) {
    return null;
  }

  if (Array.isArray(location)) {
    if (location.length !== 1 || location[0] === undefined) {
      throw new SecureHttpTransportError(
        'HTTP redirect returned an invalid Location header',
      );
    }

    return location[0];
  }

  return location;
}

async function executeHeadRequest(
  dispatcher: HeadDispatcher,
  requestUrl: URL,
  signal: AbortSignal,
): Promise<HeadDispatcherResponse> {
  try {
    const response = await dispatcher.request({
      path: getRequestPath(requestUrl),
      method: 'HEAD',
      signal,
    });

    await waitWithSignal(response.body.dump(), signal);

    return response;
  } catch (requestError: unknown) {
    try {
      await destroyDispatcherWithinTimeout(dispatcher, signal);
    } catch {
      if (signal.aborted) {
        throwIfAborted(signal);
      }

      /*
       * destroy() has already been invoked. A cleanup failure must not
       * replace the original request or response-body error.
       */
    }

    throw requestError;
  }
}

export async function performSecureHeadRequest(
  initialUrl: string,
  timeoutMs: number,
  dependencies: SecureHttpTransportDependencies = defaultDependencies,
): Promise<SecureHeadResponse> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const deadlineMs = Date.now() + timeoutMs;
  const visitedUrls = new Set<string>();

  let currentUrl = initialUrl;
  let followedRedirects = 0;

  while (true) {
    throwIfAborted(timeoutSignal);

    const target = await waitWithSignal(
      dependencies.validateTarget(currentUrl),
      timeoutSignal,
    );

    if (visitedUrls.has(target.url)) {
      throw new SecureHttpTransportError('HTTP redirect cycle was detected');
    }

    visitedUrls.add(target.url);

    const requestUrl = new URL(target.url);
    const remainingTimeoutMs = getRemainingTimeoutMs(deadlineMs);
    const dispatcher = dependencies.createDispatcher(
      target,
      remainingTimeoutMs,
    );

    const response = await executeHeadRequest(
      dispatcher,
      requestUrl,
      timeoutSignal,
    );

    await destroyDispatcherWithinTimeout(dispatcher, timeoutSignal);

    if (!REDIRECT_STATUSES.has(response.statusCode)) {
      return {
        statusCode: response.statusCode,
      };
    }

    const location = getSingleLocation(response.headers);

    if (location === null) {
      return {
        statusCode: response.statusCode,
        errorMessage: `HTTP request ended with redirect status ${response.statusCode} without a Location header`,
      };
    }

    if (followedRedirects >= MAX_REDIRECTS) {
      return {
        statusCode: response.statusCode,
        errorMessage: `HTTP redirect limit of ${MAX_REDIRECTS} was exceeded`,
      };
    }

    const nextUrl = new URL(location, target.url).toString();

    if (visitedUrls.has(nextUrl)) {
      return {
        statusCode: response.statusCode,
        errorMessage: 'HTTP redirect cycle was detected',
      };
    }

    currentUrl = nextUrl;
    followedRedirects += 1;
  }
}

export function isOutboundSecurityError(
  error: unknown,
): error is OutboundUrlValidationError | SecureHttpTransportError {
  return (
    error instanceof OutboundUrlValidationError ||
    error instanceof SecureHttpTransportError
  );
}
