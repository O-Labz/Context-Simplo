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

import { ConfigError } from './errors.js';
import type {
  AppConfig,
  ConfigValue,
  EmlExtractionMode,
  LLMProviderType,
  ResponseMode,
} from './types.js';

/**
 * Default configuration values
 *
 * Key boot behavior config:
 * - autoIndex: When true, resumes incomplete indexing for previously-added repos on boot.
 *              Does NOT auto-index the mount root. Repos must be explicitly added via API/MCP.
 * - watchEnabled: Gates per-repo watcher restore on boot. If true, restores watchers for
 *                 repos where isWatched=true. Does NOT auto-watch the mount root.
 * - autoWatch: Controls whether newly-added repos are automatically watched (via API/MCP).
 */
const DEFAULT_CONFIG = {
  llmProvider: 'none' as LLMProviderType,
  llmApiKey: undefined,
  llmBaseUrl: 'http://host.docker.internal:11434',
  llmEmbeddingModel: undefined,
  dataDir: '/data',
  autoIndex: true, // Resume incomplete indexing on boot for previously-added repos
  watchEnabled: true, // Gate per-repo watcher restore on boot
  autoWatch: true,
  logLevel: 'info' as const,
  embeddingConcurrency: 5,
  embeddingBatchSize: 20,
  graphMemoryLimitMb: 512,
  responseMode: 'compact' as ResponseMode,
  emlEnabled: true,
  emlExtraction: 'fallback' as EmlExtractionMode,
  emlWorkerConcurrency: 4,
  emlGraphHotCacheMb: 128,
  githubToken: undefined as string | undefined,
  gitlabToken: undefined as string | undefined,
  gitlabHost: 'https://gitlab.com',
  emlWebhookSecret: undefined as string | undefined,
  parseWorkerPoolSize: 2,
  parseWorkerRecycleAfter: 200,
  workerHeapMb: 512,
  indexMaxConcurrentJobs: 1,
  indexQueueMaxDepth: 16,
  graphHotCacheMb: 256,
  graphMemorySoftPct: 75,
  graphMemoryHardPct: 90,
  graphMaxNodes: 2000000,
} as const;

const ENV_VAR_MAP = {
  llmProvider: 'LLM_PROVIDER',
  llmApiKey: 'LLM_API_KEY',
  llmBaseUrl: 'LLM_BASE_URL',
  llmEmbeddingModel: 'LLM_EMBEDDING_MODEL',
  dataDir: 'CONTEXT_SIMPLO_DATA_DIR',
  autoIndex: 'CONTEXT_SIMPLO_AUTO_INDEX',
  watchEnabled: 'CONTEXT_SIMPLO_WATCH',
  autoWatch: 'CONTEXT_SIMPLO_AUTO_WATCH',
  logLevel: 'CONTEXT_SIMPLO_LOG_LEVEL',
  embeddingConcurrency: 'EMBEDDING_CONCURRENCY',
  embeddingBatchSize: 'EMBEDDING_BATCH_SIZE',
  graphMemoryLimitMb: 'GRAPH_MEMORY_LIMIT_MB',
  responseMode: 'CONTEXT_SIMPLO_RESPONSE_MODE',
  emlEnabled: 'EML_ENABLED',
  emlExtraction: 'EML_EXTRACTION',
  emlWorkerConcurrency: 'EML_WORKER_CONCURRENCY',
  emlGraphHotCacheMb: 'EML_GRAPH_HOT_CACHE_MB',
  githubToken: 'GITHUB_TOKEN',
  gitlabToken: 'GITLAB_TOKEN',
  gitlabHost: 'GITLAB_HOST',
  emlWebhookSecret: 'EML_WEBHOOK_SECRET',
  parseWorkerPoolSize: 'PARSE_WORKER_POOL_SIZE',
  parseWorkerRecycleAfter: 'PARSE_WORKER_RECYCLE_AFTER',
  workerHeapMb: 'WORKER_HEAP_MB',
  indexMaxConcurrentJobs: 'INDEX_MAX_CONCURRENT_JOBS',
  indexQueueMaxDepth: 'INDEX_QUEUE_MAX_DEPTH',
  graphHotCacheMb: 'GRAPH_HOT_CACHE_MB',
  graphMemorySoftPct: 'GRAPH_MEMORY_SOFT_PCT',
  graphMemoryHardPct: 'GRAPH_MEMORY_HARD_PCT',
  graphMaxNodes: 'GRAPH_MAX_NODES',
} as const;

const EML_EXTRACTION_MODES: readonly EmlExtractionMode[] = ['llm', 'fallback', 'off'];

type ConfigKey = keyof typeof DEFAULT_CONFIG;

export interface DashboardConfig {
  llmProvider?: LLMProviderType;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmEmbeddingModel?: string;
  embeddingConcurrency?: number;
  embeddingBatchSize?: number;
  autoIndex?: boolean;
  autoWatch?: boolean;
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
  _key: string,
  envValue: T | undefined,
  dashboardValue: T | undefined,
  defaultValue: T
): ConfigValue<T> {
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: 'env',
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
  const envAutoWatch = parseEnvValue('autoWatch', process.env[ENV_VAR_MAP.autoWatch]) as
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

  const envResponseModeRaw = process.env[ENV_VAR_MAP.responseMode];
  let envResponseMode: ResponseMode | undefined;
  if (envResponseModeRaw !== undefined) {
    if (envResponseModeRaw !== 'full' && envResponseModeRaw !== 'compact') {
      throw new ConfigError('responseMode', `Invalid value: ${envResponseModeRaw}. Must be 'full' or 'compact'`);
    }
    envResponseMode = envResponseModeRaw as ResponseMode;
  }

  const envEmlEnabled = parseEnvValue('emlEnabled', process.env[ENV_VAR_MAP.emlEnabled]) as
    | boolean
    | undefined;
  const envEmlWorkerConcurrency = parseEnvValue(
    'emlWorkerConcurrency',
    process.env[ENV_VAR_MAP.emlWorkerConcurrency]
  ) as number | undefined;
  const envEmlGraphHotCacheMb = parseEnvValue(
    'emlGraphHotCacheMb',
    process.env[ENV_VAR_MAP.emlGraphHotCacheMb]
  ) as number | undefined;
  const envGithubToken = parseEnvValue('githubToken', process.env[ENV_VAR_MAP.githubToken]) as
    | string
    | undefined;
  const envGitlabToken = parseEnvValue('gitlabToken', process.env[ENV_VAR_MAP.gitlabToken]) as
    | string
    | undefined;
  const envGitlabHost = parseEnvValue('gitlabHost', process.env[ENV_VAR_MAP.gitlabHost]) as
    | string
    | undefined;
  const envEmlWebhookSecret = parseEnvValue(
    'emlWebhookSecret',
    process.env[ENV_VAR_MAP.emlWebhookSecret]
  ) as string | undefined;
  const envParseWorkerPoolSize = parseEnvValue(
    'parseWorkerPoolSize',
    process.env[ENV_VAR_MAP.parseWorkerPoolSize]
  ) as number | undefined;
  const envParseWorkerRecycleAfter = parseEnvValue(
    'parseWorkerRecycleAfter',
    process.env[ENV_VAR_MAP.parseWorkerRecycleAfter]
  ) as number | undefined;
  const envWorkerHeapMb = parseEnvValue(
    'workerHeapMb',
    process.env[ENV_VAR_MAP.workerHeapMb]
  ) as number | undefined;
  const envIndexMaxConcurrentJobs = parseEnvValue(
    'indexMaxConcurrentJobs',
    process.env[ENV_VAR_MAP.indexMaxConcurrentJobs]
  ) as number | undefined;
  const envIndexQueueMaxDepth = parseEnvValue(
    'indexQueueMaxDepth',
    process.env[ENV_VAR_MAP.indexQueueMaxDepth]
  ) as number | undefined;
  const envGraphHotCacheMb = parseEnvValue(
    'graphHotCacheMb',
    process.env[ENV_VAR_MAP.graphHotCacheMb]
  ) as number | undefined;
  const envGraphMemorySoftPct = parseEnvValue(
    'graphMemorySoftPct',
    process.env[ENV_VAR_MAP.graphMemorySoftPct]
  ) as number | undefined;
  const envGraphMemoryHardPct = parseEnvValue(
    'graphMemoryHardPct',
    process.env[ENV_VAR_MAP.graphMemoryHardPct]
  ) as number | undefined;
  const envGraphMaxNodes = parseEnvValue(
    'graphMaxNodes',
    process.env[ENV_VAR_MAP.graphMaxNodes]
  ) as number | undefined;

  const envEmlExtractionRaw = process.env[ENV_VAR_MAP.emlExtraction];
  let envEmlExtraction: EmlExtractionMode | undefined;
  if (envEmlExtractionRaw !== undefined) {
    if (!EML_EXTRACTION_MODES.includes(envEmlExtractionRaw as EmlExtractionMode)) {
      throw new ConfigError(
        'emlExtraction',
        `Invalid value: ${envEmlExtractionRaw}. Must be one of ${EML_EXTRACTION_MODES.join(', ')}`
      );
    }
    envEmlExtraction = envEmlExtractionRaw as EmlExtractionMode;
  }

  validateUrl(envLlmBaseUrl, 'llmBaseUrl');
  validateUrl(dashboardConfig?.llmBaseUrl, 'llmBaseUrl');
  validateUrl(envGitlabHost, 'gitlabHost');

  // Validate percentage ranges
  const softPct = envGraphMemorySoftPct ?? DEFAULT_CONFIG.graphMemorySoftPct;
  const hardPct = envGraphMemoryHardPct ?? DEFAULT_CONFIG.graphMemoryHardPct;
  if (softPct < 1 || softPct > 99) {
    throw new ConfigError('graphMemorySoftPct', 'must be between 1 and 99');
  }
  if (hardPct < 1 || hardPct > 99) {
    throw new ConfigError('graphMemoryHardPct', 'must be between 1 and 99');
  }
  if (softPct >= hardPct) {
    throw new ConfigError('graphMemoryHardPct', 'must be greater than soft pct');
  }

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

  const autoWatch = createConfigValue(
    'autoWatch',
    envAutoWatch,
    dashboardConfig?.autoWatch,
    DEFAULT_CONFIG.autoWatch
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

  const responseMode = createConfigValue(
    'responseMode',
    envResponseMode,
    undefined,
    DEFAULT_CONFIG.responseMode
  );

  const emlEnabled = createConfigValue('emlEnabled', envEmlEnabled, undefined, DEFAULT_CONFIG.emlEnabled);
  const emlExtraction = createConfigValue(
    'emlExtraction',
    envEmlExtraction,
    undefined,
    DEFAULT_CONFIG.emlExtraction
  );
  const emlWorkerConcurrency = createConfigValue(
    'emlWorkerConcurrency',
    envEmlWorkerConcurrency,
    undefined,
    DEFAULT_CONFIG.emlWorkerConcurrency
  );
  const emlGraphHotCacheMb = createConfigValue(
    'emlGraphHotCacheMb',
    envEmlGraphHotCacheMb,
    undefined,
    DEFAULT_CONFIG.emlGraphHotCacheMb
  );
  const githubToken = createConfigValue('githubToken', envGithubToken, undefined, DEFAULT_CONFIG.githubToken);
  const gitlabToken = createConfigValue('gitlabToken', envGitlabToken, undefined, DEFAULT_CONFIG.gitlabToken);
  const gitlabHost = createConfigValue('gitlabHost', envGitlabHost, undefined, DEFAULT_CONFIG.gitlabHost);
  const emlWebhookSecret = createConfigValue(
    'emlWebhookSecret',
    envEmlWebhookSecret,
    undefined,
    DEFAULT_CONFIG.emlWebhookSecret
  );
  const parseWorkerPoolSize = createConfigValue(
    'parseWorkerPoolSize',
    envParseWorkerPoolSize,
    undefined,
    DEFAULT_CONFIG.parseWorkerPoolSize
  );
  const parseWorkerRecycleAfter = createConfigValue(
    'parseWorkerRecycleAfter',
    envParseWorkerRecycleAfter,
    undefined,
    DEFAULT_CONFIG.parseWorkerRecycleAfter
  );
  const workerHeapMb = createConfigValue(
    'workerHeapMb',
    envWorkerHeapMb,
    undefined,
    DEFAULT_CONFIG.workerHeapMb
  );
  const indexMaxConcurrentJobs = createConfigValue(
    'indexMaxConcurrentJobs',
    envIndexMaxConcurrentJobs,
    undefined,
    DEFAULT_CONFIG.indexMaxConcurrentJobs
  );
  const indexQueueMaxDepth = createConfigValue(
    'indexQueueMaxDepth',
    envIndexQueueMaxDepth,
    undefined,
    DEFAULT_CONFIG.indexQueueMaxDepth
  );
  const graphHotCacheMb = createConfigValue(
    'graphHotCacheMb',
    envGraphHotCacheMb,
    undefined,
    DEFAULT_CONFIG.graphHotCacheMb
  );
  const graphMemorySoftPct = createConfigValue(
    'graphMemorySoftPct',
    envGraphMemorySoftPct,
    undefined,
    DEFAULT_CONFIG.graphMemorySoftPct
  );
  const graphMemoryHardPct = createConfigValue(
    'graphMemoryHardPct',
    envGraphMemoryHardPct,
    undefined,
    DEFAULT_CONFIG.graphMemoryHardPct
  );
  const graphMaxNodes = createConfigValue(
    'graphMaxNodes',
    envGraphMaxNodes,
    undefined,
    DEFAULT_CONFIG.graphMaxNodes
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
    autoWatch,
    logLevel,
    embeddingConcurrency,
    embeddingBatchSize,
    graphMemoryLimitMb,
    responseMode,
    emlEnabled,
    emlExtraction,
    emlWorkerConcurrency,
    emlGraphHotCacheMb,
    githubToken,
    gitlabToken,
    gitlabHost,
    emlWebhookSecret,
    parseWorkerPoolSize,
    parseWorkerRecycleAfter,
    workerHeapMb,
    indexMaxConcurrentJobs,
    indexQueueMaxDepth,
    graphHotCacheMb,
    graphMemorySoftPct,
    graphMemoryHardPct,
    graphMaxNodes,
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
