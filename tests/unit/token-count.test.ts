import { describe, it, expect } from 'vitest';
import { countStructuredTokens, countWireTokens } from '../../src/mcp/token-count.js';

describe('countStructuredTokens', () => {
  it('returns 0 for undefined', () => {
    expect(countStructuredTokens(undefined)).toBe(0);
  });

  it('returns 0 for empty string wire payload', () => {
    expect(countStructuredTokens('')).toBe(countWireTokens('""'));
  });

  it('counts tokens for JSON-serialized objects', () => {
    const value = { status: 'ok', count: 2 };
    expect(countStructuredTokens(value)).toBe(countWireTokens(JSON.stringify(value)));
  });

  it('counts tokens for arrays and nested values', () => {
    const value = [{ id: 'a' }, { id: 'b', nested: { x: 1 } }];
    expect(countStructuredTokens(value)).toBe(countWireTokens(JSON.stringify(value)));
  });

  it('counts null as the JSON literal null', () => {
    expect(countStructuredTokens(null)).toBe(countWireTokens('null'));
  });
});
