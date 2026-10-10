import { lookup } from 'node:dns/promises';

import ipaddr from 'ipaddr.js';

export type OutboundProtocol = 'http:' | 'https:';

export interface ValidatedNetworkAddress {
  address: string;
  family: 4 | 6;
}

export interface ValidatedOutboundTarget {
  url: string;
  protocol: OutboundProtocol;
  hostname: string;
  port: number;
  addresses: readonly ValidatedNetworkAddress[];
}

export type DnsResolver = (hostname: string) => Promise<readonly string[]>;

export class OutboundUrlValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'OutboundUrlValidationError';
  }
}

const STANDARD_PORTS: Record<OutboundProtocol, number> = {
  'http:': 80,
  'https:': 443,
};

function isOutboundProtocol(protocol: string): protocol is OutboundProtocol {
  return protocol === 'http:' || protocol === 'https:';
}

function normalizeHostname(hostname: string): string {
  let normalizedHostname = hostname.trim().toLowerCase();

  if (normalizedHostname.startsWith('[') && normalizedHostname.endsWith(']')) {
    normalizedHostname = normalizedHostname.slice(1, -1);
  }

  if (normalizedHostname.endsWith('.')) {
    normalizedHostname = normalizedHostname.slice(0, -1);
  }

  if (normalizedHostname.length === 0) {
    throw new OutboundUrlValidationError('URL hostname is invalid');
  }

  return normalizedHostname;
}

export function validateOutboundUrl(value: string): {
  url: URL;
  protocol: OutboundProtocol;
  hostname: string;
  port: number;
} {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new OutboundUrlValidationError(
      'URL must be a valid absolute HTTP or HTTPS URL',
    );
  }

  if (!isOutboundProtocol(url.protocol)) {
    throw new OutboundUrlValidationError(
      'Only HTTP and HTTPS URLs are allowed',
    );
  }

  if (url.username !== '' || url.password !== '') {
    throw new OutboundUrlValidationError('URL credentials are not allowed');
  }

  const standardPort = STANDARD_PORTS[url.protocol];

  if (url.port !== '' && Number(url.port) !== standardPort) {
    throw new OutboundUrlValidationError(
      'URL must use the standard port for its protocol',
    );
  }

  const hostname = normalizeHostname(url.hostname);

  url.hash = '';

  return {
    url,
    protocol: url.protocol,
    hostname,
    port: standardPort,
  };
}

export function classifyPublicIpAddress(
  address: string,
): ValidatedNetworkAddress {
  let parsedAddress: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    parsedAddress = ipaddr.process(address);
  } catch {
    throw new OutboundUrlValidationError(
      'URL resolved to an invalid IP address',
    );
  }

  if (parsedAddress.range() !== 'unicast') {
    throw new OutboundUrlValidationError(
      'URL resolves to a non-public IP address',
    );
  }

  const family = parsedAddress.kind() === 'ipv4' ? 4 : 6;

  return {
    address: parsedAddress.toString(),
    family,
  };
}

export async function resolveHostnameAddresses(
  hostname: string,
): Promise<readonly string[]> {
  const records = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return records.map((record) => record.address);
}

function deduplicateAddresses(
  addresses: readonly ValidatedNetworkAddress[],
): readonly ValidatedNetworkAddress[] {
  const uniqueAddresses = new Map<string, ValidatedNetworkAddress>();

  for (const address of addresses) {
    const key = `${address.family}:${address.address}`;

    uniqueAddresses.set(key, address);
  }

  return [...uniqueAddresses.values()];
}

export async function validateOutboundTarget(
  value: string,
  resolveDns: DnsResolver = resolveHostnameAddresses,
): Promise<ValidatedOutboundTarget> {
  const { url, protocol, hostname, port } = validateOutboundUrl(value);

  let addresses: readonly ValidatedNetworkAddress[];

  if (ipaddr.isValid(hostname)) {
    addresses = [classifyPublicIpAddress(hostname)];
  } else {
    let resolvedAddresses: readonly string[];

    try {
      resolvedAddresses = await resolveDns(hostname);
    } catch {
      throw new OutboundUrlValidationError(
        'URL hostname could not be resolved',
      );
    }

    if (resolvedAddresses.length === 0) {
      throw new OutboundUrlValidationError(
        'URL hostname did not resolve to any address',
      );
    }

    addresses = resolvedAddresses.map((address) =>
      classifyPublicIpAddress(address),
    );
  }

  const uniqueAddresses = deduplicateAddresses(addresses);

  if (uniqueAddresses.length === 0) {
    throw new OutboundUrlValidationError(
      'URL hostname did not resolve to any address',
    );
  }

  return {
    url: url.toString(),
    protocol,
    hostname,
    port,
    addresses: uniqueAddresses,
  };
}
