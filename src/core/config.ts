/**
 * Configuration module with 3-layer precedence
 *
 * Precedence (highest to lowest):
 * 1. Environment variables (set by operator in docker-compose)
 * 2. Dashboard settings (stored in SQLite config table)
 * 3. Built-in defaults (hardcoded)
 *
 * Design:
 * - Each config value tracks its source for transparency
 * - Env vars "lock" values (dashboard cannot override)
 * - All secrets are validated but never logged
 * - Invalid values cause startup failure (fail-fast)
 *
 * Inputs: process.env, dashboard config from SQLite
 * Outputs: AppConfig with source tracking
 * Constraints: Env vars always win, no silent coercion
 * Assumptions: process.env is available at startup
 * Failure cases: Invalid URL, missing required key, type mismatch
 */

import { z } from 'zod';
import { ConfigError } from './errors.js';
import type { AppConfig, ConfigValue, ConfigSource, LLMProviderType } from './types.js';

const DEFAULT_CONFIG = {
  llmProvider: 'none' as LLMProviderType,
  llmApiKey: undefined,
  llmBaseUrl: 'http://host.docker.internal:11434',
  llmEmbeddingModel: undefined,
  dataDir: '/data',
  autoIndex: true,
  watchEnabled: true,
  logLevel: 'info' as const,
  embeddingConcurrency: 5,
  embeddingBatchSize: 20,
  graphMemoryLimitMb: 512,
} as const;

const ENV_VAR_MAP = {
  llmProvider: 'LLM_PROVIDER',
  llmApiKey: 'LLM_API_KEY',
  llmBaseUrl: 'LLM_BASE_URL',
  llmEmbeddingModel: 'LLM_EMBEDDING_MODEL',
  dataDir: 'CONTEXT_SIMPLO_DATA_DIR',
  autoIndex: 'CONTEXT_SIMPLO_AUTO_INDEX',
  watchEnabled: 'CONTEXT_SIMPLO_WATCH',
  logLevel: 'CONTEXT_SIMPLO_LOG_LEVEL',
  embeddingConcurrency: 'EMBEDDING_CONCURRENCY',
  embeddingBatchSize: 'EMBEDDING_BATCH_SIZE',
  graphMemoryLimitMb: 'GRAPH_MEMORY_LIMIT_MB',
} as const;

type ConfigKey = keyof typeof DEFAULT_CONFIG;

export interface DashboardConfig {
  llmProvider?: LLMProviderType;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmEmbeddingModel?: string;
  embeddingConcurrency?: number;
  embeddingBatchSize?: number;
}

function parseEnvValue(key: ConfigKey, envValue: string | undefined): unknown {
  if (envValue === undefined) {
    return undefined;
  }

  const defaultValue = DEFAULT_CONFIG[key];

  if (typeof defaultValue === 'boolean') {
    const lower = envValue.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    throw new ConfigError(key, `Invalid boolean value: ${envValue}`);
  }

  if (typeof defaultValue === 'number') {
    const num = Number(envValue);
    if (Number.isNaN(num)) {
      throw new ConfigError(key, `Invalid number value: ${envValue}`);
    }
    return num;
  }

  return envValue;
}

function validateUrl(url: string | undefined, key: string): void {
  if (!url) return;

  try {
    new URL(url);
  } catch (error) {
    throw new ConfigError(key, `Invalid URL: ${url}`, error as Error);
  }
}

function createConfigValue<T>(
  key: ConfigKey,
  envValue: T | undefined,
  dashboardValue: T | undefined,
  defaultValue: T
): ConfigValue<T> {
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: 'environment',
      isLocked: true,
    };
  }

  if (dashboardValue !== undefined) {
    return {
      value: dashboardValue,
      source: 'dashboard',
      isLocked: false,
    };
  }

  return {
    value: defaultValue,
    source: 'default',
    isLocked: false,
  };
}

export function loadConfig(dashboardConfig?: DashboardConfig): AppConfig {
  const envLlmProvider = parseEnvValue('llmProvider', process.env[ENV_VAR_MAP.llmProvider]) as
    | LLMProviderType
    | undefined;
  const envLlmApiKey = parseEnvValue('llmApiKey', process.env[ENV_VAR_MAP.llmApiKey]) as
    | string
    | undefined;
  const envLlmBaseUrl = parseEnvValue('llmBaseUrl', process.env[ENV_VAR_MAP.llmBaseUrl]) as
    | string
    | undefined;
  const envLlmEmbeddingModel = parseEnvValue(
    'llmEmbeddingModel',
    process.env[ENV_VAR_MAP.llmEmbeddingModel]
  ) as string | undefined;
  const envDataDir = parseEnvValue('dataDir', process.env[ENV_VAR_MAP.dataDir]) as
    | string
    | undefined;
  const envAutoIndex = parseEnvValue('autoIndex', process.env[ENV_VAR_MAP.autoIndex]) as
    | boolean
    | undefined;
  const envWatchEnabled = parseEnvValue('watchEnabled', process.env[ENV_VAR_MAP.watchEnabled]) as
    | boolean
    | undefined;
  const envLogLevel = parseEnvValue('logLevel', process.env[ENV_VAR_MAP.logLevel]) as
    | 'error' | 'warn' | 'info' | 'debug'
    | undefined;
  const envEmbeddingConcurrency = parseEnvValue(
    'embeddingConcurrency',
    process.env[ENV_VAR_MAP.embeddingConcurrency]
  ) as number | undefined;
  const envEmbeddingBatchSize = parseEnvValue(
    'embeddingBatchSize',
    process.env[ENV_VAR_MAP.embeddingBatchSize]
  ) as number | undefined;
  const envGraphMemoryLimitMb = parseEnvValue(
    'graphMemoryLimitMb',
    process.env[ENV_VAR_MAP.graphMemoryLimitMb]
  ) as number | undefined;

  validateUrl(envLlmBaseUrl, 'llmBaseUrl');
  validateUrl(dashboardConfig?.llmBaseUrl, 'llmBaseUrl');

  const llmProvider = createConfigValue(
    'llmProvider',
    envLlmProvider,
    dashboardConfig?.llmProvider,
    DEFAULT_CONFIG.llmProvider
  );

  const llmApiKey = createConfigValue(
    'llmApiKey',
    envLlmApiKey,
    dashboardConfig?.llmApiKey,
    DEFAULT_CONFIG.llmApiKey
  );

  const llmBaseUrl = createConfigValue(
    'llmBaseUrl',
    envLlmBaseUrl,
    dashboardConfig?.llmBaseUrl,
    DEFAULT_CONFIG.llmBaseUrl
  );

  const llmEmbeddingModel = createConfigValue(
    'llmEmbeddingModel',
    envLlmEmbeddingModel,
    dashboardConfig?.llmEmbeddingModel,
    DEFAULT_CONFIG.llmEmbeddingModel
  );

  const dataDir = createConfigValue(
    'dataDir',
    envDataDir,
    undefined,
    DEFAULT_CONFIG.dataDir
  );

  const autoIndex = createConfigValue(
    'autoIndex',
    envAutoIndex,
    undefined,
    DEFAULT_CONFIG.autoIndex
  );

  const watchEnabled = createConfigValue(
    'watchEnabled',
    envWatchEnabled,
    undefined,
    DEFAULT_CONFIG.watchEnabled
  );

  const logLevel = createConfigValue(
    'logLevel',
    envLogLevel,
    undefined,
    DEFAULT_CONFIG.logLevel
  );

  const embeddingConcurrency = createConfigValue(
    'embeddingConcurrency',
    envEmbeddingConcurrency,
    dashboardConfig?.embeddingConcurrency,
    DEFAULT_CONFIG.embeddingConcurrency
  );

  const embeddingBatchSize = createConfigValue(
    'embeddingBatchSize',
    envEmbeddingBatchSize,
    dashboardConfig?.embeddingBatchSize,
    DEFAULT_CONFIG.embeddingBatchSize
  );

  const graphMemoryLimitMb = createConfigValue(
    'graphMemoryLimitMb',
    envGraphMemoryLimitMb,
    undefined,
    DEFAULT_CONFIG.graphMemoryLimitMb
  );

  if (llmProvider.value === 'openai' && !llmApiKey.value) {
    throw new ConfigError(
      'llmApiKey',
      'LLM_API_KEY is required when LLM_PROVIDER is openai'
    );
  }

  if (llmProvider.value === 'azure' && !llmApiKey.value) {
    throw new ConfigError(
      'llmApiKey',
      'LLM_API_KEY is required when LLM_PROVIDER is azure'
    );
  }

  return {
    llmProvider,
    llmApiKey,
    llmBaseUrl,
    llmEmbeddingModel,
    dataDir,
    autoIndex,
    watchEnabled,
    logLevel,
    embeddingConcurrency,
    embeddingBatchSize,
    graphMemoryLimitMb,
  };
}

export function getDefaultEmbeddingModel(provider: LLMProviderType): string | undefined {
  switch (provider) {
    case 'openai':
      return 'text-embedding-3-small';
    case 'ollama':
      return 'nomic-embed-text';
    case 'azure':
      return 'text-embedding-ada-002';
    case 'none':
      return undefined;
  }
}

export function getDefaultEmbeddingDimensions(provider: LLMProviderType, model?: string): number {
  if (provider === 'openai') {
    if (model === 'text-embedding-3-small') return 1536;
    if (model === 'text-embedding-3-large') return 3072;
    return 1536;
  }

  if (provider === 'ollama') {
    if (model === 'nomic-embed-text') return 768;
    if (model === 'mxbai-embed-large') return 1024;
    return 768;
  }

  if (provider === 'azure') {
    return 1536;
  }

  return 0;
}

export function logConfigSources(config: AppConfig, logger: (msg: string) => void): void {
  const entries = Object.entries(config) as [keyof AppConfig, ConfigValue<unknown>][];

  for (const [key, configValue] of entries) {
    const value = key.includes('ApiKey') || key.includes('apiKey')
      ? '[REDACTED]'
      : JSON.stringify(configValue.value);

    logger(`Config ${key}: ${value} (source: ${configValue.source})`);
  }
}
