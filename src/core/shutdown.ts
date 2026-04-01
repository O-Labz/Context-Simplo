/**
 * Shutdown Manager - Graceful teardown
 *
 * What it does:
 * Manages ordered cleanup on SIGTERM/SIGINT to prevent data corruption.
 *
 * Inputs: Cleanup handlers registered by components
 * Outputs: Ordered execution of cleanup, process exit
 * Constraints: 10-second hard timeout
 * Assumptions: Handlers are async and may throw
 * Failure cases: Handler timeout, handler throws, multiple signals
 *
 * Design:
 * - Handlers registered with priority (higher = earlier)
 * - Execute in priority order
 * - Continue on handler errors (log and proceed)
 * - Hard timeout kills process if graceful shutdown stalls
 * - Idempotent (multiple signals trigger once)
 */

export type CleanupHandler = () => Promise<void> | void;

export interface CleanupRegistration {
  name: string;
  handler: CleanupHandler;
  priority: number;
}

export class ShutdownManager {
  private handlers: CleanupRegistration[] = [];
  private isShuttingDown = false;
  private hardTimeoutMs: number;

  constructor(hardTimeoutMs: number = 10000) {
    this.hardTimeoutMs = hardTimeoutMs;
    this.setupSignalHandlers();
  }

  register(name: string, handler: CleanupHandler, priority: number = 0): void {
    this.handlers.push({ name, handler, priority });
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  /**
   * Trigger graceful shutdown programmatically
   */
  async triggerShutdown(reason: string = 'manual'): Promise<void> {
    return this.shutdown(reason);
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n${signal} received, shutting down gracefully...`);

    const hardTimeout = setTimeout(() => {
      console.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.hardTimeoutMs);

    for (const { name, handler } of this.handlers) {
      try {
        console.log(`Cleanup: ${name}...`);
        await handler();
      } catch (error) {
        console.error(`Cleanup failed for ${name}:`, error);
      }
    }

    clearTimeout(hardTimeout);
    console.log('Shutdown complete');
    process.exit(0);
  }
}
