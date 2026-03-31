/**
 * Secret Scrubber Tests
 */

import { describe, it, expect } from 'vitest';
import { scrubSecrets, hasSecrets } from '../../src/security/scrubber.js';

describe('Secret Scrubber', () => {
  it('should detect and redact AWS keys', () => {
    const code = `
      const accessKey = 'AKIAIOSFODNN7EXAMPLE';
      const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:aws_key]');
    expect(detected.length).toBeGreaterThan(0);
    expect(detected[0]?.category).toBe('aws_key');
  });

  it('should detect and redact GitHub tokens', () => {
    const code = `
      const token = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:github_token]');
    expect(detected.length).toBe(1);
  });

  it('should detect and redact OpenAI keys', () => {
    const code = `
      const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:openai_key]');
    expect(detected.length).toBe(1);
  });

  it('should detect private keys', () => {
    const code = `
      const privateKey = \`-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----\`;
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:private_key]');
    expect(detected.length).toBe(1);
  });

  it('should not redact example/test secrets', () => {
    const code = `
      // Example API key: sk-example123
      const testKey = 'sk-test-1234567890abcdefghijklmnopqrstuvwxyz';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).not.toContain('[REDACTED');
    expect(detected.length).toBe(0);
  });

  it('should detect JWT tokens', () => {
    const code = `
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:jwt]');
    expect(detected.length).toBe(1);
  });

  it('should detect database connection strings', () => {
    const code = `
      const dbUrl = 'postgres://user:password@localhost:5432/mydb';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:connection_string]');
    expect(detected.length).toBe(1);
  });

  it('should handle multiple secrets in one file', () => {
    const code = `
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const githubToken = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const openaiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(detected.length).toBe(3);
    expect(scrubbed).toContain('[REDACTED:aws_key]');
    expect(scrubbed).toContain('[REDACTED:github_token]');
    expect(scrubbed).toContain('[REDACTED:openai_key]');
  });

  it('should correctly identify files with secrets', () => {
    const codeWithSecrets = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const codeWithoutSecrets = 'const name = "John Doe";';

    expect(hasSecrets(codeWithSecrets)).toBe(true);
    expect(hasSecrets(codeWithoutSecrets)).toBe(false);
  });

  it('should not redact comments', () => {
    const code = `
      // This is an example: sk-example123
      /* Example token: ghp_example123 */
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(detected.length).toBe(0);
  });
});
