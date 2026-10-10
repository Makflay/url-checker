import { describe, expect, it, vi } from 'vitest';

import type { DnsResolver } from './outbound-url-validation';
import {
  OutboundUrlValidationError,
  classifyPublicIpAddress,
  validateOutboundTarget,
  validateOutboundUrl,
} from './outbound-url-validation';

describe('outbound URL validation', () => {
  describe('validateOutboundUrl', () => {
    it.each([
      {
        value: 'http://example.com/path',
        protocol: 'http:',
        port: 80,
      },
      {
        value: 'http://example.com:80/path',
        protocol: 'http:',
        port: 80,
      },
      {
        value: 'https://example.com/path',
        protocol: 'https:',
        port: 443,
      },
      {
        value: 'https://example.com:443/path',
        protocol: 'https:',
        port: 443,
      },
    ])('accepts $value', ({ value, protocol, port }) => {
      const result = validateOutboundUrl(value);

      expect(result.protocol).toBe(protocol);
      expect(result.hostname).toBe('example.com');
      expect(result.port).toBe(port);
    });

    it.each([
      'ftp://example.com',
      'file:///etc/passwd',
      'https://user@example.com',
      'https://user:password@example.com',
      'http://example.com:443',
      'https://example.com:80',
      'https://example.com:8443',
      'not-a-url',
    ])('rejects unsafe URL syntax: %s', (value) => {
      expect(() => validateOutboundUrl(value)).toThrow(
        OutboundUrlValidationError,
      );
    });

    it('removes a fragment from the normalized URL', () => {
      const result = validateOutboundUrl(
        'https://example.com/path?value=1#fragment',
      );

      expect(result.url.toString()).toBe('https://example.com/path?value=1');
    });

    it('normalizes a non-standard IPv4 representation', () => {
      const result = validateOutboundUrl('http://0x7f000001');

      expect(result.hostname).toBe('127.0.0.1');
    });
  });

  describe('classifyPublicIpAddress', () => {
    it.each([
      ['8.8.8.8', 4],
      ['1.1.1.1', 4],
      ['2606:4700:4700::1111', 6],
      ['2001:4860:4860::8888', 6],
    ] as const)('accepts public address %s', (address, expectedFamily) => {
      expect(classifyPublicIpAddress(address)).toEqual({
        address,
        family: expectedFamily,
      });
    });

    it.each([
      '0.0.0.0',
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '224.0.0.1',
      '192.0.2.1',
      '198.51.100.1',
      '203.0.113.1',
      '::',
      '::1',
      'fc00::1',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:169.254.169.254',
    ])('rejects non-public address %s', (address) => {
      expect(() => classifyPublicIpAddress(address)).toThrow(
        'URL resolves to a non-public IP address',
      );
    });

    it('normalizes a public IPv4-mapped IPv6 address', () => {
      expect(classifyPublicIpAddress('::ffff:8.8.8.8')).toEqual({
        address: '8.8.8.8',
        family: 4,
      });
    });
  });

  describe('validateOutboundTarget', () => {
    it('returns every validated DNS address', async () => {
      const resolveDns: DnsResolver = vi
        .fn<DnsResolver>()
        .mockResolvedValue(['8.8.8.8', '2606:4700:4700::1111']);

      const result = await validateOutboundTarget(
        'https://example.com/path',
        resolveDns,
      );

      expect(resolveDns).toHaveBeenCalledWith('example.com');

      expect(result).toEqual({
        url: 'https://example.com/path',
        protocol: 'https:',
        hostname: 'example.com',
        port: 443,
        addresses: [
          {
            address: '8.8.8.8',
            family: 4,
          },
          {
            address: '2606:4700:4700::1111',
            family: 6,
          },
        ],
      });
    });

    it('rejects a hostname with mixed public and private DNS results', async () => {
      const resolveDns: DnsResolver = async () =>
        Promise.resolve(['8.8.8.8', '10.0.0.1']);

      await expect(
        validateOutboundTarget('https://mixed.example.com', resolveDns),
      ).rejects.toThrow('URL resolves to a non-public IP address');
    });

    it('rejects a hostname with no DNS results', async () => {
      const resolveDns: DnsResolver = async () => Promise.resolve([]);

      await expect(
        validateOutboundTarget('https://empty.example.com', resolveDns),
      ).rejects.toThrow('URL hostname did not resolve to any address');
    });

    it('normalizes DNS failures to a safe error', async () => {
      const resolveDns: DnsResolver = () =>
        Promise.reject(new Error('getaddrinfo ENOTFOUND internal-name'));

      await expect(
        validateOutboundTarget('https://unknown.example.com', resolveDns),
      ).rejects.toThrow('URL hostname could not be resolved');
    });

    it.each([
      'http://127.0.0.1',
      'http://2130706433',
      'http://0x7f000001',
      'http://[::1]',
      'http://[::ffff:127.0.0.1]',
      'http://169.254.169.254',
    ])('rejects unsafe IP-literal target %s', async (value) => {
      const resolveDns: DnsResolver = vi.fn<DnsResolver>();

      await expect(validateOutboundTarget(value, resolveDns)).rejects.toThrow(
        'URL resolves to a non-public IP address',
      );

      expect(resolveDns).not.toHaveBeenCalled();
    });

    it('accepts a public IP literal without DNS resolution', async () => {
      const resolveDns: DnsResolver = vi.fn<DnsResolver>();

      const result = await validateOutboundTarget(
        'https://8.8.8.8/path',
        resolveDns,
      );

      expect(result.addresses).toEqual([
        {
          address: '8.8.8.8',
          family: 4,
        },
      ]);

      expect(resolveDns).not.toHaveBeenCalled();
    });

    it('deduplicates normalized DNS results', async () => {
      const resolveDns: DnsResolver = async () =>
        Promise.resolve(['8.8.8.8', '8.8.8.8', '::ffff:8.8.8.8']);

      const result = await validateOutboundTarget(
        'https://example.com',
        resolveDns,
      );

      expect(result.addresses).toEqual([
        {
          address: '8.8.8.8',
          family: 4,
        },
      ]);
    });
  });
});
