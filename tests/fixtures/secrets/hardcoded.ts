// Sample TypeScript file with hardcoded secrets for testing scrubber

// BAD: Hardcoded API keys
const OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";

// BAD: Hardcoded AWS credentials
const AWS_CONFIG = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
};

// BAD: Hardcoded database password
const DB_CONNECTION = "postgresql://admin:SuperSecret123@db.example.com:5432/prod";

// BAD: Hardcoded JWT secret
const JWT_SECRET = "my-super-secret-jwt-key-that-should-not-be-here";

// BAD: Hardcoded private key
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`;

// GOOD: Using environment variables
const SAFE_API_KEY = process.env.OPENAI_API_KEY;
const SAFE_DB_URL = process.env.DATABASE_URL;

export function authenticateUser(token: string): boolean {
  // BAD: Using hardcoded secret
  return token === JWT_SECRET;
}

export function connectToDatabase() {
  // BAD: Using hardcoded connection string
  return DB_CONNECTION;
}
