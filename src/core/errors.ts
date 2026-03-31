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

export class MCPProtocolError extends ContextSimploError {
  readonly code = 'MCP_PROTOCOL_ERROR';
  readonly mcpErrorCode: number;

  constructor(message: string, mcpErrorCode: number, cause?: Error) {
    super(message, cause);
    this.mcpErrorCode = mcpErrorCode;
  }
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof LLMError) {
    return error.isRetryable;
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
