import { encode } from 'gpt-tokenizer';

export function countWireTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return encode(text).length;
}

export function countStructuredTokens(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  return countWireTokens(JSON.stringify(value));
}
