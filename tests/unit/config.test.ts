import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getDefaultEmbeddingModel } from '../../src/core/config.js';

describe('Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('LLM_') || key.startsWith('CONTEXT_SIMPLO_') || key.startsWith('EMBEDDING_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('loadConfig', () => {
    it('should load default config when no env vars or dashboard config', () => {
      const config = loadConfig();

      expect(config.llmProvider.value).toBe('none');
      expect(config.llmProvider.source).toBe('default');
      expect(config.llmProvider.isLocked).toBe(false);

      expect(config.dataDir.value).toBe('/data');
      expect(config.autoIndex.value).toBe(true);
      expect(config.watchEnabled.value).toBe(true);
    });

    it('should prioritize env vars over dashboard config', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.LLM_API_KEY = 'sk-test';

      const config = loadConfig({
        llmProvider: 'ollama',
        llmApiKey: 'different-key',
      });

      expect(config.llmProvider.value).toBe('openai');
      expect(config.llmProvider.source).toBe('environment');
      expect(config.llmProvider.isLocked).toBe(true);

      expect(config.llmApiKey.value).toBe('sk-test');
      expect(config.llmApiKey.source).toBe('environment');
      expect(config.llmApiKey.isLocked).toBe(true);
    });

    it('should use dashboard config when env vars not set', () => {
      const config = loadConfig({
        llmProvider: 'ollama',
        llmBaseUrl: 'http://localhost:11434',
        embeddingConcurrency: 3,
      });

      expect(config.llmProvider.value).toBe('ollama');
      expect(config.llmProvider.source).toBe('dashboard');
      expect(config.llmProvider.isLocked).toBe(false);

      expect(config.llmBaseUrl.value).toBe('http://localhost:11434');
      expect(config.embeddingConcurrency.value).toBe(3);
    });

    it('should parse boolean env vars correctly', () => {
      process.env.CONTEXT_SIMPLO_AUTO_INDEX = 'false';
      process.env.CONTEXT_SIMPLO_WATCH = '0';

      const config = loadConfig();

      expect(config.autoIndex.value).toBe(false);
      expect(config.watchEnabled.value).toBe(false);
    });

    it('should parse number env vars correctly', () => {
      process.env.EMBEDDING_CONCURRENCY = '10';
      process.env.EMBEDDING_BATCH_SIZE = '50';

      const config = loadConfig();

      expect(config.embeddingConcurrency.value).toBe(10);
      expect(config.embeddingBatchSize.value).toBe(50);
    });

    it('should throw error for invalid boolean', () => {
      process.env.CONTEXT_SIMPLO_AUTO_INDEX = 'maybe';

      expect(() => loadConfig()).toThrow('Invalid boolean value');
    });

    it('should throw error for invalid number', () => {
      process.env.EMBEDDING_CONCURRENCY = 'abc';

      expect(() => loadConfig()).toThrow('Invalid number value');
    });

    it('should throw error for invalid URL', () => {
      process.env.LLM_BASE_URL = 'not-a-url';

      expect(() => loadConfig()).toThrow('Invalid URL');
    });

    it('should require API key for openai provider', () => {
      process.env.LLM_PROVIDER = 'openai';

      expect(() => loadConfig()).toThrow('LLM_API_KEY is required');
    });
  });

  describe('getDefaultEmbeddingModel', () => {
    it('should return correct default for each provider', () => {
      expect(getDefaultEmbeddingModel('openai')).toBe('text-embedding-3-small');
      expect(getDefaultEmbeddingModel('ollama')).toBe('nomic-embed-text');
      expect(getDefaultEmbeddingModel('azure')).toBe('text-embedding-ada-002');
      expect(getDefaultEmbeddingModel('none')).toBeUndefined();
    });
  });
});
