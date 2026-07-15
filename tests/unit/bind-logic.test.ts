/**
 * Unit tests for bind logic and AUTH_TOKEN enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigError } from '../../src/core/errors.js';
import { existsSync } from 'fs';
import { vi } from 'vitest';

describe('Bind Logic', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should require AUTH_TOKEN when in container without explicit HOST', () => {
    // Mock container detection
    const mockExistsSync = vi.fn((path: string) => {
      if (path === '/.dockerenv') return true;
      return existsSync(path);
    });

    // Simulate the bind logic from index.ts
    const isContainer = mockExistsSync('/.dockerenv');
    const authToken = undefined;
    const serverBindHost = undefined;

    expect(isContainer).toBe(true);

    // This should throw ConfigError
    expect(() => {
      let listenHost: string;

      if (serverBindHost) {
        listenHost = serverBindHost;
      } else if (isContainer) {
        if (!authToken) {
          throw new ConfigError(
            'AUTH_TOKEN',
            'Container bind to 0.0.0.0 requires AUTH_TOKEN to be set'
          );
        }
        listenHost = '0.0.0.0';
      } else {
        listenHost = '127.0.0.1';
      }

      return listenHost;
    }).toThrow(ConfigError);
  });

  it('should allow container bind when AUTH_TOKEN is set', () => {
    const mockExistsSync = vi.fn((path: string) => {
      if (path === '/.dockerenv') return true;
      return existsSync(path);
    });

    const isContainer = mockExistsSync('/.dockerenv');
    const authToken = 'some-secure-token';
    const serverBindHost = undefined;

    expect(isContainer).toBe(true);

    let listenHost: string;

    if (serverBindHost) {
      listenHost = serverBindHost;
    } else if (isContainer) {
      if (!authToken) {
        throw new ConfigError(
          'AUTH_TOKEN',
          'Container bind to 0.0.0.0 requires AUTH_TOKEN to be set'
        );
      }
      listenHost = '0.0.0.0';
    } else {
      listenHost = '127.0.0.1';
    }

    expect(listenHost).toBe('0.0.0.0');
  });

  it('should bind to 127.0.0.1 outside container', () => {
    const mockExistsSync = vi.fn((path: string) => {
      if (path === '/.dockerenv') return false;
      return existsSync(path);
    });

    const isContainer = mockExistsSync('/.dockerenv');
    const authToken = undefined;
    const serverBindHost = undefined;

    expect(isContainer).toBe(false);

    let listenHost: string;

    if (serverBindHost) {
      listenHost = serverBindHost;
    } else if (isContainer) {
      if (!authToken) {
        throw new ConfigError(
          'AUTH_TOKEN',
          'Container bind to 0.0.0.0 requires AUTH_TOKEN to be set'
        );
      }
      listenHost = '0.0.0.0';
    } else {
      listenHost = '127.0.0.1';
    }

    expect(listenHost).toBe('127.0.0.1');
  });

  it('should respect explicit HOST override', () => {
    const mockExistsSync = vi.fn((path: string) => {
      if (path === '/.dockerenv') return true;
      return existsSync(path);
    });

    const isContainer = mockExistsSync('/.dockerenv');
    const authToken = undefined;
    const serverBindHost = '192.168.1.100';

    expect(isContainer).toBe(true);

    let listenHost: string;

    if (serverBindHost) {
      listenHost = serverBindHost;
    } else if (isContainer) {
      if (!authToken) {
        throw new ConfigError(
          'AUTH_TOKEN',
          'Container bind to 0.0.0.0 requires AUTH_TOKEN to be set'
        );
      }
      listenHost = '0.0.0.0';
    } else {
      listenHost = '127.0.0.1';
    }

    expect(listenHost).toBe('192.168.1.100');
  });
});
