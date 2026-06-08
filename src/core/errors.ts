/**
 * Typed error hierarchy for Context-Simplo
 *
 * All errors extend ContextSimploError and include:
 * - Descriptive message
 * - Error code for programmatic handling
 * - Optional cause chain for debugging
 * - No sensitive data in messages
 */

export abstract class ContextSimploError extends Error {
  abstract readonly code: string;
  declare readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause?.message,
    };
  }
}

export class ParseError extends ContextSimploError {
  readonly code = 'PARSE_ERROR';

  constructor(filePath: string, reason: string, cause?: Error) {
    super(`Failed to parse ${filePath}: ${reason}`, cause);
  }
}

export class GraphError extends ContextSimploError {
  readonly code = 'GRAPH_ERROR';

  constructor(operation: string, reason: string, cause?: Error) {
    super(`Graph operation '${operation}' failed: ${reason}`, cause);
  }
}

export class StoreError extends ContextSimploError {
  readonly code = 'STORE_ERROR';

  constructor(operation: string, reason: string, cause?: Error) {
    super(`Storage operation '${operation}' failed: ${reason}`, cause);
  }
}

export class LLMError extends ContextSimploError {
  readonly code = 'LLM_ERROR';
  readonly isRetryable: boolean;

  constructor(provider: string, reason: string, isRetryable: boolean = false, cause?: Error) {
    super(`LLM provider '${provider}' error: ${reason}`, cause);
    this.isRetryable = isRetryable;
  }
}

export class ConfigError extends ContextSimploError {
  readonly code = 'CONFIG_ERROR';

  constructor(key: string, reason: string, cause?: Error) {
    super(`Configuration error for '${key}': ${reason}`, cause);
  }
}

export class SecurityError extends ContextSimploError {
  readonly code = 'SECURITY_ERROR';

  constructor(reason: string, cause?: Error) {
    super(`Security violation: ${reason}`, cause);
  }
}

export class ValidationError extends ContextSimploError {
  readonly code = 'VALIDATION_ERROR';
  readonly field?: string;

  constructor(message: string, field?: string, cause?: Error) {
    super(message, cause);
    this.field = field;
  }
}

export class NotFoundError extends ContextSimploError {
  readonly code = 'NOT_FOUND';
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`);
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

export class IndexQueueFullError extends ContextSimploError {
  readonly code = 'INDEX_QUEUE_FULL';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number = 30) {
    super('Index queue is full, retry later');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MCPProtocolError extends ContextSimploError {
  readonly code = 'MCP_PROTOCOL_ERROR';
  readonly mcpErrorCode: number;

  constructor(message: string, mcpErrorCode: number, cause?: Error) {
    super(message, cause);
    this.mcpErrorCode = mcpErrorCode;
  }
}

/**
 * Base class for all Engineering Memory Layer (EML) domain errors.
 * Each subclass carries a stable `code` and the canonical `httpStatus`
 * from the plan's error-to-status table (single source of truth).
 */
export abstract class EmlError extends ContextSimploError {
  abstract readonly httpStatus: number;
}

export class EmlDisabledError extends EmlError {
  readonly code = 'eml_disabled';
  readonly httpStatus = 503;

  constructor() {
    super('Engineering Memory Layer is disabled (set EML_ENABLED=true)');
  }
}

export class MemoryValidationError extends EmlError {
  readonly code = 'memory_invalid';
  readonly httpStatus = 400;
  readonly field?: string;

  constructor(reason: string, field?: string, cause?: Error) {
    super(`Invalid memory request: ${reason}`, cause);
    this.field = field;
  }
}

export class MemoryNotFoundError extends EmlError {
  readonly code = 'memory_not_found';
  readonly httpStatus = 404;

  constructor(memoryId: string) {
    super(`Memory not found: ${memoryId}`);
  }
}

export class DuplicateMemoryError extends EmlError {
  readonly code = 'memory_duplicate';
  readonly httpStatus = 409;

  constructor(idempotencyKey: string) {
    super(`Memory with idempotency key already exists: ${idempotencyKey}`);
  }
}

export class EventValidationError extends EmlError {
  readonly code = 'event_invalid';
  readonly httpStatus = 400;

  constructor(reason: string, cause?: Error) {
    super(`Invalid event: ${reason}`, cause);
  }
}

export class EventIngestConflictError extends EmlError {
  readonly code = 'event_duplicate';
  readonly httpStatus = 409;

  constructor(contentHash: string) {
    super(`Event already ingested: ${contentHash}`);
  }
}

export class LlmUnavailableError extends EmlError {
  readonly code = 'llm_unavailable';
  readonly httpStatus = 503;

  constructor(reason: string, cause?: Error) {
    super(`LLM unavailable: ${reason}`, cause);
  }
}

export class GraphQueryError extends EmlError {
  readonly code = 'graph_query_failed';
  readonly httpStatus = 500;

  constructor(operation: string, reason: string, cause?: Error) {
    super(`Graph query '${operation}' failed: ${reason}`, cause);
  }
}

export class WebhookSignatureError extends EmlError {
  readonly code = 'webhook_bad_signature';
  readonly httpStatus = 401;

  constructor(reason: string = 'signature mismatch') {
    super(`Webhook signature verification failed: ${reason}`);
  }
}

export class VcsAuthError extends EmlError {
  readonly code = 'vcs_auth_failed';
  readonly httpStatus = 502;

  constructor(reason: string, cause?: Error) {
    super(`VCS authentication failed: ${reason}`, cause);
  }
}

export class VcsRateLimitError extends EmlError {
  readonly code = 'vcs_rate_limited';
  readonly httpStatus = 429;
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number, cause?: Error) {
    super('VCS rate limit exceeded', cause);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RepositoryNotIndexedError extends EmlError {
  readonly code = 'repo_not_indexed';
  readonly httpStatus = 404;

  constructor(repositoryId: string) {
    super(`Repository not indexed: ${repositoryId}`);
  }
}

export class ImpactTargetNotFoundError extends EmlError {
  readonly code = 'impact_target_not_found';
  readonly httpStatus = 404;

  constructor(targetRef: string) {
    super(`Impact target not found: ${targetRef}`);
  }
}

export class ArchitectureRuleValidationError extends EmlError {
  readonly code = 'rule_invalid';
  readonly httpStatus = 400;

  constructor(reason: string, cause?: Error) {
    super(`Invalid architecture rule: ${reason}`, cause);
  }
}

export class ConcurrencyConflictError extends EmlError {
  readonly code = 'concurrency_conflict';
  readonly httpStatus = 409;

  constructor(resource: string) {
    super(`Concurrent update conflict on ${resource}`);
  }
}

export class ExtractionError extends EmlError {
  readonly code = 'extraction_failed';
  readonly httpStatus = 500;

  constructor(reason: string, cause?: Error) {
    super(`Extraction failed: ${reason}`, cause);
  }
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof LLMError) {
    return error.isRetryable;
  }
  // Support plain errors with a retryable property (e.g. from tests or external libs)
  if ('retryable' in error && typeof (error as any).retryable === 'boolean') {
    return (error as any).retryable;
  }
  return false;
}

export function sanitizeErrorForLogging(error: Error): Record<string, unknown> {
  if (error instanceof ContextSimploError) {
    return error.toJSON();
  }
  return {
    name: error.name,
    message: error.message,
  };
}
