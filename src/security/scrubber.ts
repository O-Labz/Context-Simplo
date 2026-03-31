/**
 * Secret Scrubber - Detects and redacts sensitive data
 *
 * What it does:
 * Scans code content for secrets (API keys, tokens, passwords, private keys)
 * and replaces them with [REDACTED:<category>] markers.
 *
 * Inputs: Code content (string)
 * Outputs: Scrubbed content, detected secrets metadata
 * Constraints: Must not have false positives on legitimate code
 * Assumptions: Regex patterns cover common secret formats
 * Failure cases: Novel secret format, high false positive rate
 *
 * Design:
 * - 40+ regex patterns organized by category
 * - Each pattern has confidence score (0-1)
 * - High-confidence patterns (>0.9) always redact
 * - Medium-confidence (0.7-0.9) redact if context suggests secret
 * - Low-confidence (<0.7) log warning but don't redact
 * - Patterns tested against known secret formats
 *
 * Performance: O(n * p) where n=content length, p=pattern count
 * Concurrency: Stateless, thread-safe
 * Security: Prevents secrets from entering index/embeddings
 */

export interface SecretPattern {
  name: string;
  category: string;
  pattern: RegExp;
  confidence: number;
}

export interface DetectedSecret {
  category: string;
  line: number;
  confidence: number;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    category: 'aws_key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    confidence: 1.0,
  },
  {
    name: 'AWS Secret Key',
    category: 'aws_secret',
    pattern: /aws_secret_access_key\s*=\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    confidence: 1.0,
  },
  {
    name: 'GitHub Token',
    category: 'github_token',
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    confidence: 1.0,
  },
  {
    name: 'GitHub Classic Token',
    category: 'github_token',
    pattern: /ghp_[A-Za-z0-9]{36}/g,
    confidence: 1.0,
  },
  {
    name: 'OpenAI API Key',
    category: 'openai_key',
    pattern: /sk-[A-Za-z0-9]{48,}/g,
    confidence: 1.0,
  },
  {
    name: 'Anthropic API Key',
    category: 'anthropic_key',
    pattern: /sk-ant-[A-Za-z0-9\-]{95,}/g,
    confidence: 1.0,
  },
  {
    name: 'Stripe API Key',
    category: 'stripe_key',
    pattern: /sk_live_[A-Za-z0-9]{24,}/g,
    confidence: 1.0,
  },
  {
    name: 'Stripe Restricted Key',
    category: 'stripe_key',
    pattern: /rk_live_[A-Za-z0-9]{24,}/g,
    confidence: 1.0,
  },
  {
    name: 'Google API Key',
    category: 'google_key',
    pattern: /AIza[A-Za-z0-9_\-]{35}/g,
    confidence: 1.0,
  },
  {
    name: 'Google OAuth',
    category: 'google_oauth',
    pattern: /[0-9]+-[A-Za-z0-9_]{32}\.apps\.googleusercontent\.com/g,
    confidence: 0.95,
  },
  {
    name: 'Slack Token',
    category: 'slack_token',
    pattern: /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
    confidence: 1.0,
  },
  {
    name: 'Slack Webhook',
    category: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    confidence: 1.0,
  },
  {
    name: 'Twilio API Key',
    category: 'twilio_key',
    pattern: /SK[A-Za-z0-9]{32}/g,
    confidence: 0.9,
  },
  {
    name: 'SendGrid API Key',
    category: 'sendgrid_key',
    pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/g,
    confidence: 1.0,
  },
  {
    name: 'JWT Token',
    category: 'jwt',
    pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    confidence: 0.85,
  },
  {
    name: 'RSA Private Key',
    category: 'private_key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g,
    confidence: 1.0,
  },
  {
    name: 'EC Private Key',
    category: 'private_key',
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]+?-----END EC PRIVATE KEY-----/g,
    confidence: 1.0,
  },
  {
    name: 'SSH Private Key',
    category: 'private_key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    confidence: 1.0,
  },
  {
    name: 'PGP Private Key',
    category: 'private_key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]+?-----END PGP PRIVATE KEY BLOCK-----/g,
    confidence: 1.0,
  },
  {
    name: 'Generic API Key',
    category: 'api_key',
    pattern: /api[_-]?key\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi,
    confidence: 0.8,
  },
  {
    name: 'Generic Secret',
    category: 'secret',
    pattern: /secret\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi,
    confidence: 0.75,
  },
  {
    name: 'Generic Token',
    category: 'token',
    pattern: /token\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi,
    confidence: 0.75,
  },
  {
    name: 'Generic Password',
    category: 'password',
    pattern: /password\s*[=:]\s*['"]?([A-Za-z0-9_\-!@#$%^&*]{8,})['"]?/gi,
    confidence: 0.7,
  },
  {
    name: 'Database Connection String',
    category: 'connection_string',
    pattern: /(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^\/]+/gi,
    confidence: 0.95,
  },
  {
    name: 'Bearer Token',
    category: 'bearer_token',
    pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi,
    confidence: 0.9,
  },
  {
    name: 'Basic Auth',
    category: 'basic_auth',
    pattern: /Basic\s+[A-Za-z0-9+\/=]{20,}/gi,
    confidence: 0.9,
  },
  {
    name: 'Heroku API Key',
    category: 'heroku_key',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    confidence: 0.7,
  },
  {
    name: 'Mailgun API Key',
    category: 'mailgun_key',
    pattern: /key-[A-Za-z0-9]{32}/g,
    confidence: 0.85,
  },
  {
    name: 'Mailchimp API Key',
    category: 'mailchimp_key',
    pattern: /[A-Za-z0-9]{32}-us[0-9]{1,2}/g,
    confidence: 0.85,
  },
  {
    name: 'NPM Token',
    category: 'npm_token',
    pattern: /npm_[A-Za-z0-9]{36}/g,
    confidence: 1.0,
  },
  {
    name: 'PyPI Token',
    category: 'pypi_token',
    pattern: /pypi-[A-Za-z0-9_\-]{100,}/g,
    confidence: 1.0,
  },
  {
    name: 'Docker Hub Token',
    category: 'docker_token',
    pattern: /dckr_pat_[A-Za-z0-9_\-]{40,}/g,
    confidence: 1.0,
  },
  {
    name: 'GitLab Token',
    category: 'gitlab_token',
    pattern: /glpat-[A-Za-z0-9_\-]{20,}/g,
    confidence: 1.0,
  },
  {
    name: 'Bitbucket Token',
    category: 'bitbucket_token',
    pattern: /ATBB[A-Za-z0-9]{32,}/g,
    confidence: 1.0,
  },
  {
    name: 'Azure Storage Key',
    category: 'azure_key',
    pattern: /AccountKey=[A-Za-z0-9+\/=]{88}/g,
    confidence: 1.0,
  },
  {
    name: 'Firebase API Key',
    category: 'firebase_key',
    pattern: /AIza[A-Za-z0-9_\-]{35}/g,
    confidence: 0.9,
  },
  {
    name: 'Cloudflare API Key',
    category: 'cloudflare_key',
    pattern: /[A-Za-z0-9_\-]{37}/g,
    confidence: 0.6,
  },
  {
    name: 'Square Access Token',
    category: 'square_token',
    pattern: /sq0atp-[A-Za-z0-9_\-]{22}/g,
    confidence: 1.0,
  },
  {
    name: 'Square OAuth Secret',
    category: 'square_secret',
    pattern: /sq0csp-[A-Za-z0-9_\-]{43}/g,
    confidence: 1.0,
  },
  {
    name: 'PayPal Token',
    category: 'paypal_token',
    pattern: /access_token\$production\$[A-Za-z0-9]{16}\$[A-Za-z0-9]{32}/g,
    confidence: 1.0,
  },
  {
    name: 'Telegram Bot Token',
    category: 'telegram_token',
    pattern: /[0-9]{8,10}:[A-Za-z0-9_\-]{35}/g,
    confidence: 0.95,
  },
  {
    name: 'Discord Bot Token',
    category: 'discord_token',
    pattern: /[MN][A-Za-z0-9]{23,25}\.[A-Za-z0-9]{6}\.[A-Za-z0-9_\-]{27,}/g,
    confidence: 0.95,
  },
];

export function scrubSecrets(content: string): { scrubbed: string; detected: DetectedSecret[] } {
  let scrubbed = content;
  const detected: DetectedSecret[] = [];
  const lines = content.split('\n');

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.confidence < 0.7) continue;

    let match;
    while ((match = pattern.pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1] || '';

      if (shouldRedact(line, pattern)) {
        scrubbed = scrubbed.replace(match[0], `[REDACTED:${pattern.category}]`);
        detected.push({
          category: pattern.category,
          line: lineNumber,
          confidence: pattern.confidence,
        });
      }

      pattern.pattern.lastIndex = 0;
    }
  }

  return { scrubbed, detected };
}

function shouldRedact(line: string, pattern: SecretPattern): boolean {
  if (pattern.confidence >= 0.9) {
    return true;
  }

  const lowerLine = line.toLowerCase();

  if (
    lowerLine.includes('example') ||
    lowerLine.includes('test') ||
    lowerLine.includes('mock') ||
    lowerLine.includes('dummy') ||
    lowerLine.includes('placeholder')
  ) {
    return false;
  }

  if (lowerLine.includes('// ') || lowerLine.includes('# ') || lowerLine.includes('* ')) {
    return false;
  }

  return true;
}

export function hasSecrets(content: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.confidence >= 0.9 && pattern.pattern.test(content)) {
      pattern.pattern.lastIndex = 0;
      return true;
    }
    pattern.pattern.lastIndex = 0;
  }
  return false;
}
