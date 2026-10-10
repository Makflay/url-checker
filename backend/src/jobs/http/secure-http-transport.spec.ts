import type { Socket } from 'node:net';

import { buildConnector } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import type {
  ValidatedNetworkAddress,
  ValidatedOutboundTarget,
} from './outbound-url-validation';
import { OutboundUrlValidationError } from './outbound-url-validation';
import {
  createPinnedConnector,
  createPinnedLookup,
  performSecureHeadRequest,
} from './secure-http-transport';
import type {
  HeadDispatcherFactory,
  OutboundTargetValidator,
} from './secure-http-transport';

function createTarget(
  url: string,
  addresses: readonly ValidatedNetworkAddress[] = [
    {
      address: '8.8.8.8',
      family: 4,
    },
  ],
): ValidatedOutboundTarget {
  const parsedUrl = new URL(url);

  return {
    url: parsedUrl.toString(),
    protocol: parsedUrl.protocol as 'http:' | 'https:',
    hostname: parsedUrl.hostname,
    port: parsedUrl.protocol === 'https:' ? 443 : 80,
    addresses,
  };
}

function createResponse(
  statusCode: number,
  location?: string,
): {
  statusCode: number;
  headers: Record<string, string | undefined>;
  body: {
    dump: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };
} {
  return {
    statusCode,
    headers:
      location === undefined
        ? {}
        : {
            location,
          },
    body: {
      dump: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    },
  };
}

describe('secure HTTP transport', () => {
  describe('createPinnedLookup', () => {
    it('returns only validated addresses without performing DNS', async () => {
      const target = createTarget('https://example.com', [
        {
          address: '8.8.8.8',
          family: 4,
        },
        {
          address: '2606:4700:4700::1111',
          family: 6,
        },
      ]);

      const lookup = createPinnedLookup(target);

      const result = await new Promise<
        Array<{ address: string; family: number }>
      >((resolve, reject) => {
        lookup(
          'example.com',
          {
            all: true,
          },
          (error, addresses) => {
            if (error !== null) {
              reject(error);

              return;
            }

            if (!Array.isArray(addresses)) {
              reject(new Error('Expected all lookup addresses'));

              return;
            }

            resolve(addresses);
          },
        );
      });

      expect(result).toEqual([
        {
          address: '8.8.8.8',
          family: 4,
        },
        {
          address: '2606:4700:4700::1111',
          family: 6,
        },
      ]);
    });

    it('filters validated addresses by the requested family', async () => {
      const lookup = createPinnedLookup(
        createTarget('https://example.com', [
          {
            address: '8.8.8.8',
            family: 4,
          },
          {
            address: '2606:4700:4700::1111',
            family: 6,
          },
        ]),
      );

      const result = await new Promise<{
        address: string;
        family: number;
      }>((resolve, reject) => {
        lookup(
          'example.com',
          {
            all: false,
            family: 6,
          },
          (error, address, family) => {
            if (error !== null) {
              reject(error);

              return;
            }

            if (Array.isArray(address)) {
              reject(new Error('Expected one lookup address'));

              return;
            }

            resolve({
              address,
              family: family ?? 0,
            });
          },
        );
      });

      expect(result).toEqual({
        address: '2606:4700:4700::1111',
        family: 6,
      });
    });

    it('rejects a lookup for another hostname', async () => {
      const lookup = createPinnedLookup(createTarget('https://example.com'));

      await expect(
        new Promise<void>((resolve, reject) => {
          lookup(
            'different.example.com',
            {
              all: false,
            },
            (error) => {
              if (error !== null) {
                reject(error);

                return;
              }

              resolve();
            },
          );
        }),
      ).rejects.toThrow('Unexpected hostname requested by HTTP transport');
    });
  });

  describe('createPinnedConnector', () => {
    it('preserves the original hostname and TLS servername', async () => {
      const target = createTarget('https://example.com');
      const socket = {
        remoteAddress: '8.8.8.8',
        destroy: vi.fn(),
      } as unknown as Socket;

      const connectorBuilder: typeof buildConnector = vi.fn(() => {
        const connector: ReturnType<typeof buildConnector> = (
          options,
          callback,
        ): void => {
          expect(options.hostname).toBe('example.com');
          expect(options.servername).toBe('example.com');
          expect(options.protocol).toBe('https:');
          expect(options.port).toBe('443');

          callback(null, socket);
        };

        return connector;
      });

      const connector = createPinnedConnector(target, 1000, connectorBuilder);

      await new Promise<void>((resolve, reject) => {
        connector(
          {
            hostname: 'example.com',
            host: 'example.com',
            protocol: 'https:',
            port: '443',
            servername: 'example.com',
          },
          (error, connectedSocket) => {
            if (error !== null) {
              reject(error);

              return;
            }

            expect(connectedSocket).toBe(socket);
            resolve();
          },
        );
      });

      expect(connectorBuilder).toHaveBeenCalledTimes(1);

      expect(connectorBuilder).toHaveBeenCalledWith({
        timeout: 1000,
        maxCachedSessions: 0,
        autoSelectFamily: false,
        autoSelectFamilyAttemptTimeout: 250,
        lookup: expect.any(Function) as unknown,
      });
    });

    it('rejects an unexpected connector hostname before connecting', async () => {
      const target = createTarget('https://example.com');

      const baseConnector = vi.fn<ReturnType<typeof buildConnector>>();

      const connectorBuilder: typeof buildConnector = vi.fn(
        () => baseConnector,
      );

      const connector = createPinnedConnector(target, 1000, connectorBuilder);

      await expect(
        new Promise<void>((resolve, reject) => {
          connector(
            {
              hostname: 'different.example.com',
              host: 'different.example.com',
              protocol: 'https:',
              port: '443',
              servername: 'different.example.com',
            },
            (error, _socket) => {
              if (error !== null) {
                reject(error);

                return;
              }

              resolve();
            },
          );
        }),
      ).rejects.toThrow(
        'HTTP transport attempted to connect to an unexpected hostname',
      );

      expect(baseConnector).not.toHaveBeenCalled();
    });

    it('rejects an unexpected connector port before connecting', async () => {
      const target = createTarget('https://example.com');

      const baseConnector = vi.fn<ReturnType<typeof buildConnector>>();

      const connectorBuilder: typeof buildConnector = vi.fn(
        () => baseConnector,
      );

      const connector = createPinnedConnector(target, 1000, connectorBuilder);

      await expect(
        new Promise<void>((resolve, reject) => {
          connector(
            {
              hostname: 'example.com',
              host: 'example.com:8443',
              protocol: 'https:',
              port: '8443',
              servername: 'example.com',
            },
            (error, _socket) => {
              if (error !== null) {
                reject(error);

                return;
              }

              resolve();
            },
          );
        }),
      ).rejects.toThrow('HTTP transport attempted to use an unexpected port');

      expect(baseConnector).not.toHaveBeenCalled();
    });

    it('destroys a socket connected to an unvalidated address', async () => {
      const target = createTarget('https://example.com');
      const destroyMock = vi.fn();
      const socket = {
        remoteAddress: '1.1.1.1',
        destroy: destroyMock,
      } as unknown as Socket;

      const connectorBuilder: typeof buildConnector = vi.fn(() => {
        const connector: ReturnType<typeof buildConnector> = (
          _options,
          callback,
        ): void => {
          callback(null, socket);
        };

        return connector;
      });

      const connector = createPinnedConnector(target, 1000, connectorBuilder);

      await expect(
        new Promise<void>((resolve, reject) => {
          connector(
            {
              hostname: 'example.com',
              host: 'example.com',
              protocol: 'https:',
              port: '443',
              servername: 'example.com',
            },
            (error, _socket) => {
              if (error !== null) {
                reject(error);

                return;
              }

              resolve();
            },
          );
        }),
      ).rejects.toThrow('HTTP connection used an unvalidated address');
      expect(destroyMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('performSecureHeadRequest', () => {
    it('returns the final successful status', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) =>
        Promise.resolve(createTarget(url)),
      );

      const destroy = vi.fn(() => Promise.resolve());
      const request = vi.fn(() => Promise.resolve(createResponse(204)));

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => ({
        request,
        destroy,
      }));

      const result = await performSecureHeadRequest(
        'https://example.com/path?value=1',
        1000,
        {
          validateTarget,
          createDispatcher,
        },
      );

      expect(result).toEqual({
        statusCode: 204,
      });

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'HEAD',
          path: '/path?value=1',
          signal: expect.any(AbortSignal) as unknown,
        }),
      );

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('validates every public redirect target', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) =>
        Promise.resolve(createTarget(url)),
      );

      const responses = [
        createResponse(302, '/second'),
        createResponse(301, 'https://other.example.com/final'),
        createResponse(200),
      ];

      const dispatchers = responses.map((response) => ({
        request: vi.fn(() => Promise.resolve(response)),
        destroy: vi.fn(() => Promise.resolve()),
      }));

      let dispatcherIndex = 0;

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => {
        const dispatcher = dispatchers[dispatcherIndex];
        dispatcherIndex += 1;

        if (dispatcher === undefined) {
          throw new Error('Unexpected dispatcher request');
        }

        return dispatcher;
      });

      const result = await performSecureHeadRequest(
        'https://example.com/start',
        1000,
        {
          validateTarget,
          createDispatcher,
        },
      );

      expect(result).toEqual({
        statusCode: 200,
      });

      expect(validateTarget).toHaveBeenNthCalledWith(
        1,
        'https://example.com/start',
      );
      expect(validateTarget).toHaveBeenNthCalledWith(
        2,
        'https://example.com/second',
      );
      expect(validateTarget).toHaveBeenNthCalledWith(
        3,
        'https://other.example.com/final',
      );

      for (const dispatcher of dispatchers) {
        expect(dispatcher.destroy).toHaveBeenCalledTimes(1);
      }
    });

    it('blocks a redirect rejected by URL validation', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) => {
        if (url === 'http://127.0.0.1/admin') {
          return Promise.reject(
            new OutboundUrlValidationError(
              'URL resolves to a non-public IP address',
            ),
          );
        }

        return Promise.resolve(createTarget(url));
      });

      const destroy = vi.fn(() => Promise.resolve());

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => ({
        request: vi.fn(() =>
          Promise.resolve(createResponse(302, 'http://127.0.0.1/admin')),
        ),
        destroy,
      }));

      await expect(
        performSecureHeadRequest('https://example.com', 1000, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toThrow('URL resolves to a non-public IP address');

      expect(validateTarget).toHaveBeenCalledTimes(2);
      expect(createDispatcher).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('detects a cyclic redirect', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) =>
        Promise.resolve(createTarget(url)),
      );

      const responses = [
        createResponse(302, '/second'),
        createResponse(302, '/start'),
      ];

      let responseIndex = 0;

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => ({
        request: vi.fn(() => {
          const response = responses[responseIndex];
          responseIndex += 1;

          if (response === undefined) {
            return Promise.reject(new Error('Unexpected request'));
          }

          return Promise.resolve(response);
        }),
        destroy: vi.fn(() => Promise.resolve()),
      }));

      const result = await performSecureHeadRequest(
        'https://example.com/start',
        1000,
        {
          validateTarget,
          createDispatcher,
        },
      );

      expect(result).toEqual({
        statusCode: 302,
        errorMessage: 'HTTP redirect cycle was detected',
      });
    });

    it('allows at most five followed redirects', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) =>
        Promise.resolve(createTarget(url)),
      );

      let requestIndex = 0;

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => ({
        request: vi.fn(() => {
          const currentIndex = requestIndex;
          requestIndex += 1;

          return Promise.resolve(
            createResponse(
              302,
              `https://example.com/redirect-${currentIndex + 1}`,
            ),
          );
        }),
        destroy: vi.fn(() => Promise.resolve()),
      }));

      const result = await performSecureHeadRequest(
        'https://example.com/start',
        1000,
        {
          validateTarget,
          createDispatcher,
        },
      );

      expect(result).toEqual({
        statusCode: 302,
        errorMessage: 'HTTP redirect limit of 5 was exceeded',
      });

      expect(createDispatcher).toHaveBeenCalledTimes(6);
    });

    it('destroys the dispatcher when the request fails', async () => {
      const validateTarget: OutboundTargetValidator = (url) =>
        Promise.resolve(createTarget(url));

      const destroy = vi.fn(() => Promise.resolve());

      const createDispatcher: HeadDispatcherFactory = () => ({
        request: vi.fn(() => Promise.reject(new TypeError('socket failure'))),
        destroy,
      });

      await expect(
        performSecureHeadRequest('https://example.com', 1000, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toThrow('socket failure');

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('uses one AbortSignal for the entire redirect chain', async () => {
      const validateTarget = vi.fn<OutboundTargetValidator>((url) =>
        Promise.resolve(createTarget(url)),
      );

      const receivedSignals: AbortSignal[] = [];
      let requestIndex = 0;

      const createDispatcher: HeadDispatcherFactory = vi.fn(() => ({
        request: vi.fn(({ signal }: { signal: AbortSignal }) => {
          receivedSignals.push(signal);
          requestIndex += 1;

          return Promise.resolve(
            requestIndex === 1
              ? createResponse(302, '/final')
              : createResponse(200),
          );
        }),
        destroy: vi.fn(() => Promise.resolve()),
      }));

      await performSecureHeadRequest('https://example.com/start', 1000, {
        validateTarget,
        createDispatcher,
      });

      expect(receivedSignals).toHaveLength(2);
      expect(receivedSignals[0]).toBe(receivedSignals[1]);
    });

    it('stops waiting for validation when the overall timeout expires', async () => {
      const validateTarget: OutboundTargetValidator = () =>
        new Promise(() => undefined);

      const createDispatcher: HeadDispatcherFactory = vi.fn();

      await expect(
        performSecureHeadRequest('https://slow.example.com', 10, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toMatchObject({
        name: 'TimeoutError',
      });

      expect(createDispatcher).not.toHaveBeenCalled();
    });

    it('applies the overall timeout while the body is being discarded', async () => {
      const validateTarget: OutboundTargetValidator = (url) =>
        Promise.resolve(createTarget(url));

      const destroy = vi.fn(() => Promise.resolve());

      const createDispatcher: HeadDispatcherFactory = () => ({
        request: vi.fn(() =>
          Promise.resolve({
            statusCode: 200,
            headers: {},
            body: {
              dump: vi.fn(() => new Promise<void>(() => undefined)),
            },
          }),
        ),
        destroy,
      });

      await expect(
        performSecureHeadRequest('https://example.com', 10, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toMatchObject({
        name: 'TimeoutError',
      });

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('preserves the request error when cleanup also fails', async () => {
      const requestError = new TypeError('TLS handshake failed');

      const validateTarget: OutboundTargetValidator = (url) =>
        Promise.resolve(createTarget(url));

      const destroy = vi.fn(() =>
        Promise.reject(new Error('Dispatcher cleanup failed')),
      );

      const createDispatcher: HeadDispatcherFactory = () => ({
        request: vi.fn(() => Promise.reject(requestError)),
        destroy,
      });

      await expect(
        performSecureHeadRequest('https://example.com', 1000, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toBe(requestError);

      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('limits dispatcher cleanup by the overall timeout', async () => {
      const validateTarget: OutboundTargetValidator = (url) =>
        Promise.resolve(createTarget(url));

      const destroy = vi.fn(() => new Promise<void>(() => undefined));

      const createDispatcher: HeadDispatcherFactory = () => ({
        request: vi.fn(() => Promise.resolve(createResponse(200))),
        destroy,
      });

      await expect(
        performSecureHeadRequest('https://example.com', 10, {
          validateTarget,
          createDispatcher,
        }),
      ).rejects.toMatchObject({
        name: 'TimeoutError',
      });

      expect(destroy).toHaveBeenCalledTimes(1);
    });
  });
});
