import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';

import { Client } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ValidatedOutboundTarget } from './outbound-url-validation';
import { createPinnedConnector } from './secure-http-transport';

interface RunningServer {
  port: number;
  sockets: Set<Socket>;
  close(): Promise<void>;
}

function startHttpServer(handler: RequestListener): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    const sockets = new Set<Socket>();

    server.on('connection', (socket) => {
      sockets.add(socket);

      socket.on('close', () => {
        sockets.delete(socket);
      });
    });

    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);

      const address = server.address();

      if (address === null || typeof address === 'string') {
        reject(new Error('Expected a TCP server address'));

        return;
      }

      resolve({
        port: address.port,
        sockets,

        close(): Promise<void> {
          return new Promise((closeResolve, closeReject) => {
            for (const socket of sockets) {
              socket.destroy();
            }

            server.close((error) => {
              if (error !== undefined) {
                closeReject(error);

                return;
              }

              closeResolve();
            });
          });
        },
      });
    });
  });
}

function createLocalTarget(
  port: number,
  addresses: ValidatedOutboundTarget['addresses'],
): ValidatedOutboundTarget {
  return {
    url: `http://fallback.test:${port}/`,
    protocol: 'http:',
    hostname: 'fallback.test',
    port,
    addresses,
  };
}

function verifyLocalTestAddress(
  socket: Socket | TLSSocket,
  target: ValidatedOutboundTarget,
): void {
  const allowedAddresses = new Set(
    target.addresses.map((address) => address.address),
  );

  const remoteAddress = socket.remoteAddress?.replace(/^::ffff:/, '');

  if (remoteAddress === undefined || !allowedAddresses.has(remoteAddress)) {
    throw new Error('Unexpected local integration-test address');
  }
}

describe('secure HTTP transport integration', () => {
  const runningServers: RunningServer[] = [];

  afterEach(async () => {
    await Promise.all(runningServers.splice(0).map((server) => server.close()));
  });

  it('falls back to another validated address without another DNS lookup', async () => {
    const server = await startHttpServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });

    runningServers.push(server);

    const target = createLocalTarget(server.port, [
      {
        address: '::1',
        family: 6,
      },
      {
        address: '127.0.0.1',
        family: 4,
      },
    ]);

    const connector = createPinnedConnector(
      target,
      1000,
      undefined,
      verifyLocalTestAddress,
    );

    const client = new Client(`http://fallback.test:${server.port}`, {
      connect: connector,
      pipelining: 1,
    });

    try {
      const response = await client.request({
        path: '/',
        method: 'HEAD',
      });

      await response.body.dump();

      expect(response.statusCode).toBe(204);
    } finally {
      await client.destroy();
    }

    await vi.waitFor(() => {
      expect(server.sockets.size).toBe(0);
    });
  });

  it('aborts a slow HTTP response and closes the connection', async () => {
    const server = await startHttpServer((_request, response) => {
      setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(200);
          response.end();
        }
      }, 200);
    });

    runningServers.push(server);

    const target = createLocalTarget(server.port, [
      {
        address: '127.0.0.1',
        family: 4,
      },
    ]);

    const connector = createPinnedConnector(
      target,
      1000,
      undefined,
      verifyLocalTestAddress,
    );

    const client = new Client(`http://fallback.test:${server.port}`, {
      connect: connector,
      pipelining: 1,
    });

    try {
      await expect(
        client.request({
          path: '/',
          method: 'HEAD',
          signal: AbortSignal.timeout(20),
        }),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      await client.destroy();
    }
    await vi.waitFor(() => {
      expect(server.sockets.size).toBe(0);
    });
  });
});
