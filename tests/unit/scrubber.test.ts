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

  it('should handle tightened Heroku pattern', () => {
    // Bare UUID should not be redacted
    const bareUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const { detected: detected1 } = scrubSecrets(bareUUID);
    expect(detected1.length).toBe(0);

    // UUID with heroku context should be redacted
    const herokuKey = 'heroku_api_key=f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const { scrubbed, detected } = scrubSecrets(herokuKey);
    expect(detected.length).toBeGreaterThan(0);
    expect(scrubbed).toContain('[REDACTED:heroku_key]');
  });

  it('should handle tightened Cloudflare pattern', () => {
    // Random 37-char string should not be redacted
    const random37 = 'a'.repeat(37);
    const { detected: detected1 } = scrubSecrets(random37);
    expect(detected1.length).toBe(0);

    // 37-char string with cloudflare context should be redacted
    const cloudflareKey = 'cloudflare_api_key=abcdefghijklmnopqrstuvwxyz1234567890a';
    const { scrubbed, detected } = scrubSecrets(cloudflareKey);
    expect(detected.length).toBeGreaterThan(0);
    expect(scrubbed).toContain('[REDACTED:cloudflare_key]');
  });

  it('should respect minimum confidence threshold', () => {
    // Low-confidence patterns (< 0.75) should be filtered out
    const code = 'some random text that might look like a pattern';
    const { detected } = scrubSecrets(code);
    
    // All detected secrets should have confidence >= 0.75
    for (const secret of detected) {
      expect(secret.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('should prevent over-redaction with max matches limit', () => {
    // Create content with many potential matches
    const manyMatches = Array(150).fill('token=abc123def456ghi789jkl012').join('\n');
    const { detected } = scrubSecrets(manyMatches);
    
    // Should stop at max matches (100) per pattern
    expect(detected.length).toBeLessThanOrEqual(100);
  });

  it('should not redact secrets in sample/fake contexts', () => {
    const code = `
      const sampleKey = 'AKIAIOSFODNN7EXAMPLE';
      const fakeToken = 'ghp_fakefakefakefakefakefakefakefakefake';
    `;

    const { detected } = scrubSecrets(code);
    expect(detected.length).toBe(0);
  });

  it('should handle GitLab tokens', () => {
    const code = `
      const gitlabToken = 'glpat-1234567890abcdefghij';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:gitlab_token]');
    expect(detected.length).toBe(1);
    expect(detected[0]?.category).toBe('gitlab_token');
  });

  it('should handle NPM tokens', () => {
    const code = `
      const npmToken = 'npm_abcdefghijklmnopqrstuvwxyz1234567890';
    `;

    const { scrubbed, detected } = scrubSecrets(code);

    expect(scrubbed).toContain('[REDACTED:npm_token]');
    expect(detected.length).toBe(1);
  });
});
